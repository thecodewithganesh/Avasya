from __future__ import annotations

from backend.integrations.claim_validator import ClaimValidator
from backend.integrations.contracts import LlmClaim


def _run(db_session, habitation, claims):
    return ClaimValidator(db_session).validate(habitation.id, claims)


def test_matching_population_is_verified(db_session, habitation):
    report = _run(db_session, habitation, [LlmClaim(field="population", value=1200)])
    assert report.claims[0].status == "VERIFIED"
    assert report.summary["VERIFIED"] == 1


def test_conflicting_population_is_conflict(db_session, habitation):
    report = _run(db_session, habitation, [LlmClaim(field="population", value=1500)])
    assert report.claims[0].status == "CONFLICT"
    assert "authoritative" in report.claims[0].explanation


def test_missing_population_habitation_is_unsupported(db_session, habitation):
    habitation.population = None
    db_session.commit()
    report = _run(db_session, habitation, [LlmClaim(field="population", value=999)])
    assert report.claims[0].status == "UNSUPPORTED"


def test_unknown_field_is_unsupported(db_session, habitation):
    report = _run(db_session, habitation, [LlmClaim(field="magic_score", value=42)])
    assert report.claims[0].status == "UNSUPPORTED"
    assert "no defined authoritative source" in report.claims[0].explanation


def test_travel_time_verified_when_route_exists(db_session, habitation, demo_world):
    # demo_world has a capacity-passing destination => transport planner CAN
    # establish a (proxy-methodology) travel time, so a matching claim verifies.
    from backend.services.transport import TransportService

    required = max(1, habitation.population or habitation.households or 1)
    plan = TransportService(db_session).plan(habitation.id, required)
    assert plan.recommended_route is not None  # world is constructed to allow a route
    actual = plan.recommended_route.travel_time_hours
    report = _run(db_session, habitation, [LlmClaim(field="travel_time_hours", value=actual)])
    assert report.claims[0].status == "VERIFIED"


def test_travel_time_conflict_detected(db_session, habitation, demo_world):
    from backend.services.transport import TransportService

    required = max(1, habitation.population or habitation.households or 1)
    plan = TransportService(db_session).plan(habitation.id, required)
    actual = plan.recommended_route.travel_time_hours
    report = _run(db_session, habitation, [LlmClaim(field="travel_time_hours", value=actual * 10)])
    assert report.claims[0].status == "CONFLICT"


def test_float_tolerance_boundaries(db_session, habitation):
    # 0.4% off a 1200 population = 4.8 persons -> inside 0.5% relative tolerance
    report = _run(db_session, habitation, [LlmClaim(field="population", value=1204)])
    assert report.claims[0].status == "VERIFIED"
    # 1% off -> outside tolerance -> CONFLICT
    report = _run(db_session, habitation, [LlmClaim(field="population", value=1213)])
    assert report.claims[0].status == "CONFLICT"


def test_risk_level_verified_after_assessment(db_session, habitation, demo_world):
    from backend.services.decision import DecisionService

    result = DecisionService(db_session).assess(habitation.id)
    level = result.risk.risk_level
    report = _run(db_session, habitation, [LlmClaim(field="risk_level", value=level)])
    assert report.claims[0].status == "VERIFIED"
    assert report.claims[0].avasya_source.startswith("risk_assessments")


def test_hazard_status_claim_validation(db_session, habitation, demo_world):
    report = _run(db_session, habitation, [LlmClaim(field="hazard_status", value="RED")])
    assert report.claims[0].status == "VERIFIED"
    report = _run(db_session, habitation, [LlmClaim(field="hazard_status", value="NO_ALERT")])
    assert report.claims[0].status == "CONFLICT"
