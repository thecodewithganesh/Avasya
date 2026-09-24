"""Grounding tests (teammate spec sections 13/14/32/35 + test scenarios 4/7).

The rule under test: the LLM reasons over evidence, it never invents evidence.
"""
from __future__ import annotations

from ai.llm.grounding import GroundingValidator
from ai.llm.schemas import GroundedResponse, LlmClaim

CONTEXT = {
    "habitation_id": 1,
    "name": "Krishnapuram",
    "population": 1240,
    "population_exposed": 620,
    "risk_score": 67.0,
    "risk_level": "MEDIUM",
    "recommendation": {"destination_id": "Relief Center North"},
}

EVIDENCE = [
    {"source_id": "DOC001", "text": "Krishnapuram experienced a flood event in 2024."},
    {"source_id": "DOC004", "text": "Krishnapuram experienced another flood event in 2025."},
]


def _response(**overrides) -> GroundedResponse:
    payload = {
        "hazard": {"type": "Flood", "affected_area": "Krishnapuram"},
        "triggered": True,
        "reason": "ok",
        "claims": [],
        "evidence_ids": [],
        "warnings": [],
    }
    payload.update(overrides)
    return GroundedResponse.model_validate(payload)


def test_structured_claim_matching_context_is_grounded() -> None:
    response = _response(
        claims=[{"field": "population", "value": 1240, "source_type": "structured_context"}]
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert report.ok
    assert report.grounded_claims == 1


def test_structured_claim_with_wrong_value_conflicts() -> None:
    # Spec test scenario: DB says 1240, LLM says 1500 -> CONFLICT (violation).
    response = _response(
        claims=[{"field": "population", "value": 1500, "source_type": "structured_context"}]
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert not report.ok
    assert any("conflicts" in v for v in report.violations)


def test_claim_on_missing_context_field_is_invention() -> None:
    response = _response(
        claims=[{"field": "travel_time_hours", "value": 0.5, "source_type": "structured_context"}]
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert not report.ok
    assert any("not present" in v for v in report.violations)


def test_rag_claim_with_supplied_source_id_is_grounded() -> None:
    response = _response(
        claims=[
            {
                "field": "recurring_incident",
                "value": True,
                "source_type": "rag",
                "source_id": "DOC001",
            }
        ],
        evidence_ids=["DOC001", "DOC004"],
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert report.ok


def test_rag_claim_with_invented_source_id_is_rejected() -> None:
    # Spec test scenario 7: a claim must not cite a source that was not supplied.
    response = _response(
        claims=[
            {
                "field": "recurring_incident",
                "value": True,
                "source_type": "rag",
                "source_id": "DOC999",
            }
        ],
        evidence_ids=["DOC999"],
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert not report.ok
    assert any("not supplied" in v for v in report.violations)
    assert any("was not supplied in rag_evidence" in v for v in report.violations)


def test_numeric_claim_cannot_hide_behind_reasoning_source() -> None:
    response = _response(
        claims=[{"field": "population", "value": 9999, "source_type": "reasoning"}]
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert not report.ok


def test_invented_destination_id_is_rejected() -> None:
    # Spec section 14: the LLM must not invent a destination.
    response = _response(
        recommendation={"destination_id": "RC42-MADE-UP"},
        reason="moved them somewhere",
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert not report.ok
    assert any("does not appear in supplied data" in v for v in report.violations)


def test_supplied_destination_id_is_accepted() -> None:
    response = _response(
        recommendation={"destination_id": "Relief Center North"},
        reason="capacity supports it",
    )
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert report.ok


def test_number_inside_text_does_not_false_conflict() -> None:
    # "the score of 67.0 is high" mentions the number — not a conflict.
    claim = LlmClaim(field="risk_level", value="the reported level MEDIUM with score 67.0", source_type="structured_context")
    response = _response(claims=[claim])
    report = GroundingValidator(CONTEXT, EVIDENCE).validate(response)
    assert report.ok


def test_empty_context_everything_structured_is_invention() -> None:
    response = _response(
        claims=[{"field": "population", "value": 1240, "source_type": "structured_context"}]
    )
    report = GroundingValidator({}, EVIDENCE).validate(response)
    assert not report.ok
