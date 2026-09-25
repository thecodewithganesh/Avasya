"""RAG subsystem tests (backend/rag wired through the integration adapter).

Covers: chunking, indexing idempotency, retrieval, the RagQueryResponse
contract mapping, /rag/index, and the honest empty-corpus 503.
"""
from __future__ import annotations

import pytest

from backend.integrations.contracts import RagQueryRequest
from backend.integrations.rag_client import RagIntegrationPending, RagClient
from backend.models import Evidence
from backend.models.enums import DataOrigin
from backend.rag.chunker import chunk_evidence
from backend.rag.embedder import NullEmbedder
from backend.rag.indexer import index_evidence
from backend.rag.schemas import RetrievalRequest
from backend.rag.retriever import retrieve


@pytest.fixture
def evidence_row(db_session) -> Evidence:
    row = Evidence(
        habitation_id=None,
        source_name="NDMA evacuation guidelines",
        source_type="report",
        evidence_type="flood",
        summary="During monsoon flooding, evacuate low-lying habitations to the nearest elevated relief centre before water levels rise.",
        evidence_payload={"description": "Follow NDMA guidelines for flood evacuation."},
        data_origin=DataOrigin.REAL,
    )
    db_session.add(row)
    db_session.commit()
    return row


def test_chunker_extracts_narrative_fields(db_session, evidence_row) -> None:
    chunks = chunk_evidence(evidence_row)
    assert chunks, "evidence with summary must produce at least one chunk"
    first = chunks[0]
    assert first.chunk_index == 0
    assert "evacuate" in first.text.lower()
    assert first.source.source_table == "evidence"
    assert first.source.source_id == evidence_row.id
    assert first.metadata["source_name"] == "NDMA evacuation guidelines"


def test_chunker_skips_empty_evidence(db_session) -> None:
    empty = Evidence(
        source_name="x",
        data_origin=DataOrigin.REAL,
        summary=None,
        evidence_payload=None,
    )
    assert chunk_evidence(empty) == []


def test_index_is_idempotent(db_session, evidence_row) -> None:
    embedder = NullEmbedder()
    first = index_evidence(db_session, embedder=embedder)
    assert first.chunks_created >= 1
    assert first.errors == []

    second = index_evidence(db_session, embedder=embedder)
    assert second.chunks_created == 0
    assert second.chunks_updated == 0
    assert second.chunks_skipped == first.chunks_created


def test_retrieve_ranks_with_null_embedder(db_session, evidence_row) -> None:
    index_evidence(db_session, embedder=NullEmbedder())
    response = retrieve(db_session, RetrievalRequest(query_text="flood evacuation", top_k=3))
    assert response.total_chunks_searched >= 1
    # NullEmbedder zero vectors normalise to score 0.0 — schema stays valid.
    for hit in response.results:
        assert 0.0 <= hit.score <= 1.0
        assert hit.text


def test_adapter_maps_to_contract(db_session, evidence_row) -> None:
    index_evidence(db_session, embedder=NullEmbedder())
    response = RagClient().query(
        RagQueryRequest(query="flood evacuation guidelines", top_k=3), db=db_session
    )
    assert response.grounding_status == "SUPPORTED"
    assert response.results
    chunk = response.results[0]
    assert chunk.chunk_id
    assert chunk.source_id.startswith("EVD-")
    assert chunk.title == "NDMA evacuation guidelines"
    assert 0.0 <= chunk.score <= 1.0


def test_adapter_raises_pending_on_empty_corpus(db_session) -> None:
    with pytest.raises(RagIntegrationPending):
        RagClient().query(RagQueryRequest(query="anything"), db=db_session)


def test_rag_query_503_until_indexed(client, db_session) -> None:
    response = client.post("/api/v1/rag/query", json={"query": "flood warning guidelines", "top_k": 3})
    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["integration_pending"] is True
    assert detail["grounding_status"] == "UNSUPPORTED"


def test_rag_index_endpoint_then_query_succeeds(client, db_session, evidence_row) -> None:
    indexed = client.post("/api/v1/rag/index", json={"batch_size": 10})
    assert indexed.status_code == 200
    body = indexed.json()
    assert body["chunks_created"] >= 1
    assert body["has_errors"] is False

    query = client.post("/api/v1/rag/query", json={"query": "flood evacuation", "top_k": 2})
    assert query.status_code == 200
    payload = query.json()
    assert payload["grounding_status"] == "SUPPORTED"
    assert len(payload["results"]) >= 1


def test_generator_extractive_mode(db_session, evidence_row) -> None:
    """No LLM configured -> answer composed strictly from retrieved chunks."""
    from backend.rag.generator import generate

    index_evidence(db_session, embedder=NullEmbedder())
    retrieval = retrieve(
        db_session, RetrievalRequest(query_text="flood evacuation", top_k=3)
    )
    answer = generate(retrieval)
    assert answer.grounding_status == "SUPPORTED"
    assert answer.mode in {"extractive", "llm"}
    # every citation points at the indexed evidence row
    for chunk in answer.chunks_used:
        assert chunk["source_id"] == f"EVD-{evidence_row.id:03d}"
    assert evidence_row.source_name in answer.answer


def test_generator_no_matches_is_unsupported(db_session) -> None:
    """Empty retrieval -> honest UNSUPPORTED, no invented answer text."""
    from backend.rag.generator import generate
    from backend.rag.schemas import RetrievalResponse

    answer = generate(
        RetrievalResponse(query_text="nothing", results=[], total_chunks_searched=0)
    )
    assert answer.mode == "none"
    assert answer.grounding_status == "UNSUPPORTED"
    assert "no answer can be grounded" in answer.answer.lower()


def test_generator_uses_llm_when_configured(db_session, evidence_row, monkeypatch) -> None:
    """Configured Qwen3 runtime -> LLM-written answer, full citations kept."""
    from backend.integrations.contracts import LlmResponse
    from backend.rag.generator import generate

    index_evidence(db_session, embedder=NullEmbedder())
    retrieval = retrieve(
        db_session, RetrievalRequest(query_text="flood evacuation", top_k=3)
    )

    calls: list[str] = []

    class StubLlm:
        def explain(self, request):
            calls.append(request.question)
            return LlmResponse(
                answer="Grounded: flood evacuation follows NDMA guidance.",
                claims=[],
                citations=["EVD-001"],
            )

    answer = generate(retrieval, llm_client=StubLlm())
    assert answer.mode == "llm"
    assert calls == ["flood evacuation"]
    assert "NDMA guidance" in answer.answer
    assert len(answer.chunks_used) >= 1


def test_rag_answer_endpoint(client, db_session, evidence_row) -> None:
    indexed = client.post("/api/v1/rag/index", json={})
    assert indexed.status_code == 200
    response = client.post(
        "/api/v1/rag/answer",
        json={"question": "flood evacuation guidelines", "top_k": 2},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["grounding_status"] == "SUPPORTED"
    assert body["answer"]
    assert body["chunks_used"]


def test_rag_answer_503_on_empty_corpus(client, db_session) -> None:
    response = client.post("/api/v1/rag/answer", json={"question": "anything"})
    assert response.status_code == 503
    assert response.json()["detail"]["integration_pending"] is True


def test_explain_uses_full_rag_when_corpus_ready(client, db_session, habitation) -> None:
    """With an indexed corpus, /explain serves retrieval-grounded citations."""
    row = Evidence(
        habitation_id=habitation.id,
        source_name="Coastal flood advisory 2024",
        source_type="report",
        evidence_type="flood",
        summary="Repeated coastal inundation affects this habitation every monsoon.",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(row)
    db_session.commit()
    client.post("/api/v1/rag/index", json={})

    response = client.post(
        f"/api/v1/habitations/{habitation.id}/explain", json={"question": "why relocate?"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["retrievalMode"] in {"extractive", "llm"}
    assert body["citations"]
    assert body["explanation"]
