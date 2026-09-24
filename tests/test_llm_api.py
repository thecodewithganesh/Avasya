"""API tests for /llm/explain + /llm/retrieval-plan wiring states.

1. No runtime configured -> honest 503 integration_pending (never fabricated).
2. Runtime configured (stubbed) -> grounded answer; ungrounded claims stripped
   and surfaced as warnings; officer never sees a silently trusted number.
"""
from __future__ import annotations

import pytest

from backend.integrations.contracts import LlmRequest, RagChunk


def _request(**context) -> LlmRequest:
    payload = {"population": 1240, "risk_level": "MEDIUM"}
    payload.update(context)
    return LlmRequest(
        question="Why is this habitation marked for relocation?",
        avasya_context=payload,
        rag_evidence=[
            RagChunk(
                chunk_id="c1",
                text="Krishnapuram experienced a flood event in 2024.",
                source_id="DOC001",
                title="Historical Incident Record",
                score=0.91,
            )
        ],
    )


def test_explain_honest_503_without_runtime(client) -> None:
    """With no model configured the API must report integration-pending, not invent."""
    response = client.post("/api/v1/llm/explain", json=_request().model_dump())
    assert response.status_code == 503
    body = response.json()["detail"]  # HTTPException nests under "detail"
    assert body["integration_pending"] is True
    assert "AVASYA_LLM" in body["message"]


def test_retrieval_plan_honest_503_without_runtime(client) -> None:
    response = client.post(
        "/api/v1/llm/retrieval-plan",
        json={"event_id": "EVT001", "hazard_type": "Flood", "location": "Krishnapuram"},
    )
    assert response.status_code == 503
    assert response.json()["detail"]["integration_pending"] is True


def test_explain_live_flow_with_stubbed_runtime(client, monkeypatch) -> None:
    """Full Stage-2 flow: grounded model output passes; violations are stripped."""
    from ai.llm.schemas import GroundedResponse, GroundingReport
    from backend.integrations.llm_client import llm_client

    grounded = GroundedResponse.model_validate(
        {
            "hazard": {"type": "Flood", "affected_area": "Krishnapuram"},
            "triggered": True,
            "assessment": {"recurring_incident": True, "urgency": "SHORT_TERM"},
            "recommendation": {"destination_id": None},
            "reason": "Historical records show repeated floods; AVASYA reports population 1240.",
            "claims": [
                {
                    "field": "population",
                    "value": 1240,
                    "source_type": "structured_context",
                },
                {
                    "field": "population",
                    "value": 1500,
                    "source_type": "structured_context",
                },
                {
                    "field": "recurring_incident",
                    "value": True,
                    "source_type": "rag",
                    "source_id": "DOC001",
                },
            ],
            "evidence_ids": ["DOC001"],
            "warnings": [],
        }
    )
    report = GroundingReport(
        ok=False,
        violations=["claim 'population'=1500 conflicts with AVASYA structured value 1240"],
        checked_claims=3,
        grounded_claims=2,
    )

    class StubService:
        def is_available(self) -> bool:
            return True

        def assess(self, *args, **kwargs):
            return grounded, report

    monkeypatch.setattr(llm_client, "_service", StubService())

    response = client.post("/api/v1/llm/explain", json=_request().model_dump())
    assert response.status_code == 200
    body = response.json()
    assert "population 1240" in body["answer"]
    assert "DOC001" in body["citations"]
    # the conflicting 1500 claim must not survive into the contract response;
    # stripping is by FIELD (the population field conflicts), so 1240 — which
    # was validated separately in the service layer — goes with it. The
    # officer still sees the true value in the answer text from AVASYA data.
    values = [claim["value"] for claim in body["claims"]]
    assert 1500 not in values
    assert any(claim["field"] == "recurring_incident" for claim in body["claims"])
