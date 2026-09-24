"""Tests for the evidence retrieval endpoints (G's frontend contract).

Rule under test: real persisted evidence in, honest INSUFFICIENT_EVIDENCE
out when nothing matches, honest 503 when the LLM is unconfigured.
"""
from __future__ import annotations

import pytest

from backend.models import (
    CapacityAssessment,
    Destination,
    Evidence,
    Habitation,
    Hazard,
    HabitationHazard,
    RiskAssessment,
)
from backend.models.enums import DataOrigin
from backend.integrations.contracts import LlmResponse


@pytest.fixture
def habitation(db_session) -> Habitation:
    row = Habitation(
        name="Krishnapuram",
        district="Thiruvallur",
        state="Tamil Nadu",
        geom="SRID=4326;POINT(80.204 13.404)",
        latitude=13.404,
        longitude=80.204,
        population=1240,
        households=310,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(row)
    db_session.flush()
    return row


def _add_evidence(db_session, habitation_id: int, **overrides) -> Evidence:
    payload = {
        "habitation_id": habitation_id,
        "source_name": "AVASYA demo hazard fixture",
        "source_type": "geojson",
        "evidence_type": "flood",
        "summary": "SYNTHETIC_DEMO demonstration hazard - NOT real evidence",
        "data_origin": DataOrigin.SYNTHETIC_DEMO,
    }
    payload.update(overrides)
    row = Evidence(**payload)
    db_session.add(row)
    db_session.flush()
    return row


def test_evidence_bundle_returns_persisted_rows(client, db_session, habitation) -> None:
    _add_evidence(db_session, habitation.id)
    _add_evidence(
        db_session,
        habitation.id,
        evidence_type="historical_events",
        source_type="csv",
        summary="SYNTHETIC_DEMO historical FLOOD 2021",
    )
    response = client.get(f"/api/v1/habitations/{habitation.id}/evidence")
    assert response.status_code == 200
    body = response.json()
    assert body["habitationId"] == str(habitation.id)
    assert len(body["evidence"]) == 2
    assert body["evidence"][0]["sourceId"].startswith("EVD-")
    assert body["evidence"][0]["origin"] == "SYNTHETIC_DEMO"


def test_evidence_bundle_empty_is_honest(client, db_session, habitation) -> None:
    response = client.get(f"/api/v1/habitations/{habitation.id}/evidence")
    assert response.status_code == 200
    body = response.json()
    assert body["evidence"] == []
    assert body["dataOrigin"] == "UNAVAILABLE"


def test_evidence_bundle_404_unknown_habitation(client) -> None:
    assert client.get("/api/v1/habitations/99999/evidence").status_code == 404


def test_search_matches_and_ranks(client, db_session, habitation) -> None:
    _add_evidence(db_session, habitation.id)
    _add_evidence(
        db_session,
        habitation.id,
        evidence_type="historical_events",
        summary="SYNTHETIC_DEMO historical FLOOD 2021 in Krishnapuram",
    )
    response = client.post("/api/v1/evidence/search", json={"query": "flood 2021"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "OK"
    assert len(body["results"]) >= 1
    # ranked: the record matching more terms leads with relevance 1.0
    assert body["results"][0]["relevance"] == 1.0


def test_search_no_match_is_insufficient_evidence(client, db_session, habitation) -> None:
    _add_evidence(db_session, habitation.id)
    response = client.post("/api/v1/evidence/search", json={"query": "volcano zombies"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "INSUFFICIENT_EVIDENCE"
    assert body["results"] == []
    assert body["dataOrigin"] == "UNAVAILABLE"


def test_search_empty_query_insufficient(client) -> None:
    response = client.post("/api/v1/evidence/search", json={"query": "   "})
    assert response.status_code == 200
    assert response.json()["status"] == "INSUFFICIENT_EVIDENCE"


def test_explain_honest_503_when_llm_unconfigured(client, db_session, habitation) -> None:
    _add_evidence(db_session, habitation.id)
    response = client.post(
        f"/api/v1/habitations/{habitation.id}/explain", json={"question": "why?"}
    )
    assert response.status_code == 503
    body = response.json()["detail"]
    assert body["llm_unavailable"] is True
    # even the failure carries the evidence the officer would need
    assert len(body["evidenceUsed"]) >= 1


def test_explanation_context_mutates_with_persisted_risk(
    client, db_session, habitation, monkeypatch
) -> None:
    """Regression guard for AVASYA result -> context -> LLM wiring.

    This is intentionally an adapter-level mutation proof, not a claim that a
    local language model ran.  It proves the route hands each current
    persisted risk value to its LLM client instead of retaining a generic or
    stale explanation context.
    """
    _add_evidence(db_session, habitation.id)
    risk = RiskAssessment(
        habitation_id=habitation.id,
        overall_risk_score=43.0,
        risk_level="LOW",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(risk)
    db_session.commit()

    received_contexts: list[dict] = []

    class RecordingLlmClient:
        def explain(self, request):
            received_contexts.append(request.avasya_context)
            return LlmResponse(
                answer=f"risk={request.avasya_context['risk_score']}",
                citations=[],
            )

    import backend.integrations.llm_client as llm_module

    monkeypatch.setattr(llm_module, "llm_client", RecordingLlmClient())

    first = client.post(f"/api/v1/habitations/{habitation.id}/explain", json={"question": "why?"})
    assert first.status_code == 200
    assert first.json()["explanation"] == "risk=43.0"

    risk.overall_risk_score = 91.0
    risk.risk_level = "HIGH"
    db_session.commit()

    second = client.post(f"/api/v1/habitations/{habitation.id}/explain", json={"question": "why?"})
    assert second.status_code == 200
    assert second.json()["explanation"] == "risk=91.0"
    assert [context["risk_score"] for context in received_contexts] == [43.0, 91.0]
