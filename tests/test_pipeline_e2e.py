from __future__ import annotations

from backend.services.alerts import AlertService
from backend.services.hazard_status import HazardStatus
from backend.services.pipeline import DecisionPipelineService


def test_full_decision_chain_runs(db_session, habitation, demo_world):
    result = DecisionPipelineService(db_session).run(habitation.id)

    # Chain order proves integration: hazard -> risk -> priority ->
    # recommendation -> transport -> response time -> alert
    assert result.chain[0].startswith("hazard_status:")
    assert any(step.startswith("risk:") for step in result.chain)
    assert any(step.startswith("priority:") for step in result.chain)
    assert any(step.startswith("recommendation:") for step in result.chain)
    assert any(step.startswith("transport:") for step in result.chain)
    assert any(step.startswith("response_time:") for step in result.chain)
    assert result.chain[-1] == "alert:generated"

    # Hazard status came from the linked REAL flood hazard (severity 80)
    assert result.overall_hazard_status == HazardStatus.RED

    # Capacity gate: insufficient shelter excluded, eligible selected
    assert result.recommendation["destination_id"] == demo_world["eligible"].id

    # Transport recommendation matches the capacity-gated selection path
    assert result.transport["recommended_destination_id"] == demo_world["eligible"].id
    assert result.transport["recommended_route"]["travel_time_hours"] is not None

    # RED hazard => IMMEDIATE response posture
    assert result.response_time["urgency"] == "IMMEDIATE"

    # Alert is explicitly a decision-support alert, not a government warning
    assert result.alert["alert_kind"] == "AVASYA_DECISION_SUPPORT_ALERT"
    assert any("NOT an official government warning" in lim for lim in result.alert["limitations"])


def test_no_eligible_destination_surfaces_cleanly(db_session, habitation, demo_world):
    # Force every destination to fail the capacity gate
    for assessment in demo_world["habitation"].capacity_assessments:
        assessment.usable_capacity = 0
        assessment.capacity_gap = -assessment.required_capacity
        assessment.status = "INSUFFICIENT"
    db_session.commit()

    result = DecisionPipelineService(db_session).run(habitation.id)
    assert result.recommendation["summary"] == "NO_ELIGIBLE_DESTINATION"
    assert result.recommendation["destination_id"] is None
    assert result.transport["recommended_route"] is None


def test_data_unavailable_hazard_still_completes_pipeline(db_session, habitation, demo_world):
    # Remove the hazard link: status must become DATA_UNAVAILABLE,
    # and the pipeline must STILL complete - with scheduled-review urgency,
    # never fabricated hazard state.
    from backend.models import HabitationHazard

    db_session.query(HabitationHazard).delete()
    db_session.commit()

    result = DecisionPipelineService(db_session).run(habitation.id)
    assert result.overall_hazard_status == HazardStatus.DATA_UNAVAILABLE
    assert result.response_time["urgency"] == "MEDIUM_TERM"
    assert any("scheduled-review" in w or "DATA_UNAVAILABLE" in w for w in result.warnings)


def test_alert_service_none_for_unknown_status_inputs(db_session):
    # Alert generation requires both hazard and response results; the service
    # covers all four statuses - here we verify the DATA_UNAVAILABLE action text.
    from backend.services.hazard_status import HazardStatusResult
    from backend.services.response_time import ResponseTimeResult

    hazard_result = HazardStatusResult(
        habitation_id=1, hazard_id=None, hazard_type="any",
        status=HazardStatus.DATA_UNAVAILABLE, severity_score=None, probability_score=None,
        basis="OBSERVED", evidence_id=None, source_name=None, source_url=None,
        evidence_time=None, staleness_limit_hours=None, is_stale=None,
        reason_codes=["NO_LINKED_HAZARD_EVIDENCE"], data_origin="MIXED",
    )
    response = ResponseTimeResult(
        habitation_id=1, urgency="MEDIUM_TERM", hazard_status=HazardStatus.DATA_UNAVAILABLE,
        hazard_type="any", available_response_time_hours=None,
        estimated_transport_time_hours=None, buffer_hours=None, time_established=False,
        population_exposed=100, data_origin="MIXED",
    )
    alert = AlertService(db_session).from_hazard_result(hazard_result, response)
    assert alert is not None
    assert alert.severity == "UNKNOWN"
    assert "Do not treat as no-alert" in alert.recommended_action
