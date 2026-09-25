"""Schema tests (teammate spec sections 18/21/33)."""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from ai.llm.schemas import GroundedResponse, RetrievalPlan


def test_retrieval_plan_accepts_valid_shape() -> None:
    plan = RetrievalPlan.model_validate(
        {
            "hazard_type": "Flood",
            "affected_area": "Krishnapuram",
            "retrieval_requirements": [
                "previous flood incidents",
                " historical recurrence ",
                "",
            ],
            "missing_information": [],
        }
    )
    assert plan.hazard_type == "Flood"
    assert plan.retrieval_requirements == [
        "previous flood incidents",
        "historical recurrence",
    ]


def test_retrieval_plan_rejects_wrong_types() -> None:
    with pytest.raises(ValidationError):
        RetrievalPlan.model_validate({"retrieval_requirements": "not-a-list"})


def test_grounded_response_full_shape() -> None:
    response = GroundedResponse.model_validate(
        {
            "hazard": {"type": "Flood", "affected_area": "Krishnapuram"},
            "triggered": True,
            "assessment": {
                "recurring_incident": True,
                "urgency": "IMMEDIATE",
                "population_exposed": 620,
            },
            "recommendation": {"destination_id": "RC02"},
            "reason": "Historical records show repeated flood incidents.",
            "claims": [
                {
                    "field": "population_exposed",
                    "value": 620,
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
    assert response.triggered is True
    assert response.assessment.urgency == "IMMEDIATE"
    assert response.claims[1].source_id == "DOC001"


def test_grounded_response_rejects_unknown_urgency() -> None:
    with pytest.raises(ValidationError):
        GroundedResponse.model_validate(
            {
                "triggered": True,
                "assessment": {"urgency": "WHENEVER"},
            }
        )


def test_claim_rejects_invalid_source_type() -> None:
    with pytest.raises(ValidationError):
        GroundedResponse.model_validate(
            {
                "triggered": True,
                "claims": [
                    {"field": "population", "value": 1240, "source_type": "vibes"}
                ],
            }
        )
