"""Evidence retrieval endpoints (frontend contract from G's evidence-api.ts).

IMPORTANT: this is honest keyword retrieval over M's persisted `evidence`
table — NOT a competing RAG implementation. The RAG teammate's semantic
engine (E5 + pgvector) plugs in behind the same contract later; until then
these endpoints return real persisted rows or an explicit
INSUFFICIENT_EVIDENCE state, never fabricated evidence.

Contract (documented in frontend/lib/evidence-api.ts):
  GET  /habitations/{id}/evidence  -> EvidenceBundle
  POST /evidence/search            -> EvidenceQueryResult
  POST /habitations/{id}/explain   -> AiExplanation (bridges ai/llm)
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models import Evidence, Habitation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["Evidence / RAG"])

# Same data-quality rule as the rest of AVASYA: never fabricate.
_INSUFFICIENT = "INSUFFICIENT_EVIDENCE"


def _record_to_dict(row: Evidence, relevance: float | None = None) -> dict[str, Any]:
    return {
        "sourceId": f"EVD-{row.id:03d}",
        "title": row.source_name,
        "sourceType": _map_source_type(row),
        "habitationId": str(row.habitation_id) if row.habitation_id is not None else None,
        "hazardType": row.evidence_type,
        "date": str(getattr(row, "created_at", None) or "")[:10] or None,
        "snippet": row.summary,
        "origin": row.data_origin.value if hasattr(row.data_origin, "value") else str(row.data_origin),
        "verification": None,  # not tracked in this table yet — honest null
        "relevance": relevance,
    }


def _map_source_type(row: Evidence) -> str:
    evidence_type = (row.evidence_type or "").lower()
    if "historical" in evidence_type:
        return "HISTORICAL_EVENT"
    if row.source_type == "csv":
        return "FIELD_SURVEY"
    if row.source_type in {"geojson", "gis"}:
        return "ASSESSMENT"
    return "REPORT"


def _chunk_to_record(hit: Any) -> dict[str, Any]:
    """Map a RAG RetrievalResult to the frontend EvidenceRecord shape."""
    metadata: dict[str, Any] = hit.metadata or {}
    source = hit.source
    # Provenance is carried in chunk metadata by the indexer. Legacy chunks
    # indexed before that field existed have no value — mark them MIXED
    # (conservative: possibly-synthetic) rather than claiming REAL.
    origin = metadata.get("data_origin") or "MIXED"
    return {
        "sourceId": f"EVD-{source.source_id:03d}",
        "title": metadata.get("source_name") or f"Evidence row {source.source_id}",
        "sourceType": _map_chunk_source_type(source.evidence_type, metadata.get("source_type")),
        "habitationId": str(source.habitation_id) if source.habitation_id is not None else None,
        "hazardType": source.evidence_type,
        "date": None,
        "snippet": hit.text,
        "origin": origin,
        "verification": metadata.get("verification"),
        "relevance": round(hit.score, 4),
    }


def _map_chunk_source_type(evidence_type: str | None, source_type: Any) -> str:
    evidence_type = (evidence_type or "").lower()
    if "historical" in evidence_type:
        return "HISTORICAL_EVENT"
    if source_type == "csv":
        return "FIELD_SURVEY"
    if source_type in {"geojson", "gis"}:
        return "ASSESSMENT"
    return "REPORT"


def _habitation_or_404(db: Session, habitation_id: int) -> Habitation:
    habitation = db.get(Habitation, habitation_id)
    if habitation is None:
        raise HTTPException(status_code=404, detail="Habitation not found")
    return habitation


@router.get(
    "/habitations/{habitation_id}/evidence",
    summary="Evidence bundle for a habitation (persisted evidence rows; never fabricated)",
)
def get_habitation_evidence(habitation_id: int, db: Session = Depends(get_db)) -> dict[str, Any]:
    _habitation_or_404(db, habitation_id)
    rows = list(
        db.scalars(
            select(Evidence)
            .where(Evidence.habitation_id == habitation_id)
            .order_by(Evidence.id)
        ).all()
    )
    origins = {row.data_origin.value for row in rows if hasattr(row.data_origin, "value")}
    bundle_origin = "UNAVAILABLE" if not rows else (origins.pop() if len(origins) == 1 else "MIXED")
    return {
        "habitationId": str(habitation_id),
        "evidence": [_record_to_dict(row) for row in rows],
        "dataOrigin": bundle_origin,
    }


@router.post(
    "/evidence/search",
    summary="Semantic retrieval over the evidence corpus (RAG) with keyword fallback",
)
def search_evidence(
    payload: dict[str, Any],
    db: Session = Depends(get_db),
    limit: int = Query(default=8, ge=1, le=20),
) -> dict[str, Any]:
    query = str(payload.get("query") or payload.get("query_text") or "").strip()
    if not query:
        return {"query": "", "results": [], "dataOrigin": "UNAVAILABLE", "status": _INSUFFICIENT}

    semantic = _semantic_search(db, query, limit)
    if semantic is not None:
        return semantic
    return _keyword_search(db, query, limit)


def _embedder_is_stub() -> bool:
    """True when the configured embedder cannot produce meaningful vectors
    (NullEmbedder zero-vector stub). Ranking against zero vectors gives every
    chunk similarity 0.0, so a 'semantic' result would be a relabelled
    arbitrary order — the keyword path actually discriminates and must answer
    instead, under its own honest label."""
    try:
        from backend.rag.embedder import NullEmbedder, get_embedder

        return isinstance(get_embedder(), NullEmbedder)
    except Exception:
        return True


def _semantic_search(db: Session, query: str, limit: int) -> dict[str, Any] | None:
    """RAG-backed retrieval. Returns None when the corpus is not ready (or the
    embedder is a stub that cannot rank) so the keyword path still answers
    (same contract shape, honest retrievalMethod)."""
    if _embedder_is_stub():
        return None
    from backend.models import DocumentChunk
    from sqlalchemy import func

    corpus = db.scalar(
        select(func.count(DocumentChunk.id)).where(DocumentChunk.embedding.is_not(None))
    ) or 0
    if corpus == 0:
        return None
    try:
        from backend.rag.retriever import retrieve
        from backend.rag.schemas import RetrievalRequest

        response = retrieve(
            db,
            RetrievalRequest(query_text=query, top_k=limit),
        )
    except Exception:
        # Retrieval stack unavailable (embedder/model missing, pgvector down):
        # fall back to keyword rather than failing the endpoint.
        logger.warning("Semantic retrieval unavailable; falling back to keyword search", exc_info=True)
        return None

    if not response.results:
        # The corpus exists but nothing matched semantically — keep the honest
        # INSUFFICIENT_EVIDENCE state instead of pretending keywords help.
        return {
            "query": query,
            "results": [],
            "dataOrigin": "UNAVAILABLE",
            "status": _INSUFFICIENT,
            "message": "No evidence in the retrieval corpus matched this query.",
        }

    results = [_chunk_to_record(hit) for hit in response.results]
    return {
        "query": query,
        "results": results,
        "dataOrigin": results[0]["origin"] if results else "UNAVAILABLE",
        "status": "OK",
        "retrievalMethod": "semantic (multilingual-e5-small → pgvector cosine)",
        "totalChunksSearched": response.total_chunks_searched,
    }


def _keyword_search(db: Session, query: str, limit: int) -> dict[str, Any]:
    terms = [term for term in query.lower().split() if len(term) > 2]
    if not terms:
        return {"query": query, "results": [], "dataOrigin": "UNAVAILABLE", "status": _INSUFFICIENT}

    rows = list(db.scalars(select(Evidence).order_by(Evidence.id)).all())
    scored: list[tuple[int, Evidence]] = []
    for row in rows:
        haystack = " ".join(
            filter(None, [row.source_name, row.summary, row.evidence_type, row.source_type])
        ).lower()
        hits = sum(1 for term in terms if term in haystack)
        if hits:
            scored.append((hits, row))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    top = scored[:limit]

    if not top:
        # Explicit insufficient-evidence state — never fabricated results.
        return {
            "query": query,
            "results": [],
            "dataOrigin": "UNAVAILABLE",
            "status": _INSUFFICIENT,
            "message": "No evidence in the persisted store matched the query terms.",
        }

    max_hits = top[0][0]
    # Say WHY the semantic engine did not answer: corpus unindexed vs. the
    # embedder being a zero-vector stub. Both land here, but the reason differs.
    if _embedder_is_stub():
        method_note = "keyword (E5 embedder unavailable — semantic ranking disabled until the embedding model is installed)"
    else:
        method_note = "keyword (semantic retrieval pending RAG indexing — run POST /api/v1/rag/index)"
    return {
        "query": query,
        "results": [
            _record_to_dict(row, relevance=round(hits / max_hits, 3)) for hits, row in top
        ],
        "dataOrigin": "MIXED",
        "status": "OK",
        "retrievalMethod": method_note,
    }


@router.post(
    "/habitations/{habitation_id}/explain",
    summary="Grounded explanation: full RAG pipeline with LLM refinement when configured, extractive citations otherwise",
)
def explain_habitation(
    habitation_id: int,
    payload: dict[str, Any] | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    habitation = _habitation_or_404(db, habitation_id)

    question = str((payload or {}).get("question") or f"Why is {habitation.name} flagged for relocation review?")
    evidence_rows = list(
        db.scalars(select(Evidence).where(Evidence.habitation_id == habitation_id)).all()
    )
    evidence_records = [_record_to_dict(row) for row in evidence_rows]

    # The LLM receives the same full, persisted decision context used by the
    # claim validator.  Do not hand-roll a smaller subset here: omitting risk,
    # capacity, or destination information makes an apparently grounded answer
    # insensitive to a changed AVASYA result.
    from ai.llm.context_builder import build_structured_context

    context = build_structured_context(db, habitation_id)

    # Corpus ready -> full RAG: retrieve semantically, then generate (LLM
    # refinement when the Qwen3 runtime is configured, extractive citations
    # otherwise). Empty corpus -> direct LLM over persisted evidence rows.
    from backend.models import DocumentChunk
    from sqlalchemy import func

    corpus = int(
        db.scalar(
            select(func.count(DocumentChunk.id)).where(
                DocumentChunk.embedding.is_not(None)
            )
        )
        or 0
    )
    if corpus > 0:
        from backend.rag.generator import generate
        from backend.rag.retriever import retrieve
        from backend.rag.schemas import RetrievalRequest

        retrieval = retrieve(
            db,
            RetrievalRequest(query_text=question, top_k=5, habitation_id=habitation_id),
        )
        answer = generate(retrieval, question=question, structured_context=context)
        return {
            "habitationId": str(habitation_id),
            "explanation": answer.answer,
            "evidenceUsed": evidence_records[:3],
            "model": "Qwen3-8B-Q4_K_M via RAG" if answer.mode == "llm" else "Extractive RAG (retrieved chunks only)",
            "generatedAt": None,
            "dataOrigin": "MIXED",
            "citations": [chunk["source_id"] for chunk in answer.chunks_used],
            "retrievalMode": answer.mode,
        }

    try:
        from backend.integrations.llm_client import LlmIntegrationPending, llm_client
        from backend.integrations.contracts import LlmRequest, RagChunk

        request = LlmRequest(
            question=question,
            avasya_context=context,
            rag_evidence=[
                RagChunk(
                    chunk_id=record["sourceId"] or f"EVD-{index}",
                    text=record["snippet"] or "",
                    source_id=record["sourceId"] or f"EVD-{index}",
                    title=record["title"],
                    score=record["relevance"] if record["relevance"] is not None else 0.5,
                )
                for index, record in enumerate(evidence_records, start=1)
            ],
        )
        response = llm_client.explain(request)
        return {
            "habitationId": str(habitation_id),
            "explanation": response.answer,
            "evidenceUsed": evidence_records[:3],
            "model": "Qwen3-8B-Q4_K_M (llama.cpp)",
            "generatedAt": None,
            "dataOrigin": "MIXED",
            "claims": [claim.model_dump() for claim in response.claims],
            "citations": response.citations,
        }
    except LlmIntegrationPending as exc:
        # Honest unavailable state: the UI renders an LLM-unavailable panel,
        # never invented text (matches evidence-api.ts UNAVAILABLE note).
        raise HTTPException(
            status_code=503,
            detail={
                "llm_unavailable": True,
                "message": str(exc),
                "evidenceUsed": evidence_records[:3],
            },
        ) from exc
