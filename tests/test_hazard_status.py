from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.models import Evidence, Hazard, HabitationHazard
from backend.models.enums import DataOrigin
from backend.services.hazard_status import (
    HazardStatus,
    classify,
)


def test_classify_red_above_red_threshold():
    status, reasons = classify("flood", 80.0, 60.0, has_evidence=True, is_stale=False)
    assert status == HazardStatus.RED
    assert "AVASYA_OPERATIONAL_THRESHOLD_RED_EXCEEDED" in reasons


def test_classify_yellow_between_thresholds():
    status, reasons = classify("flood", 45.0, 10.0, has_evidence=True, is_stale=False)
    assert status == HazardStatus.YELLOW


def test_classify_no_alert_below_yellow_with_evidence():
    status, reasons = classify("flood", 10.0, None, has_evidence=True, is_stale=False)
    assert status == HazardStatus.NO_ALERT
    assert "AVASYA_OPERATIONAL_THRESHOLD_BELOW_YELLOW" in reasons


def test_missing_evidence_is_never_no_alert():
    status, reasons = classify("flood", None, None, has_evidence=False, is_stale=None)
    assert status == HazardStatus.DATA_UNAVAILABLE
    assert "NO_LINKED_HAZARD_EVIDENCE" in reasons


def test_all_none_scores_are_data_unavailable():
    status, reasons = classify("flood", None, None, has_evidence=True, is_stale=False)
    assert status == HazardStatus.DATA_UNAVAILABLE
    assert "NO_USABLE_SEVERITY_OR_PROBABILITY_SCORES" in reasons


def test_stale_evidence_is_data_unavailable_not_no_alert():
    status, reasons = classify("flood", 90.0, 80.0, has_evidence=True, is_stale=True)
    assert status == HazardStatus.DATA_UNAVAILABLE
    assert "EVIDENCE_STALE" in reasons


def test_lightning_marks_forecast_unsupported():
    status, reasons = classify("lightning", 90.0, None, has_evidence=True, is_stale=False)
    assert status == HazardStatus.RED
    assert "DETERMINISTIC_FORECAST_UNSUPPORTED_FOR_HAZARD" in reasons


def test_probability_only_is_usable():
    status, _ = classify("cyclone", None, 70.0, has_evidence=True, is_stale=False)
    assert status == HazardStatus.RED


def test_no_linked_hazard_yields_data_unavailable(db_session, habitation):
    from backend.services.hazard_status import HazardStatusService

    results = HazardStatusService(db_session).for_habitation(habitation.id)
    assert len(results) == 1
    assert results[0].status == HazardStatus.DATA_UNAVAILABLE
    assert results[0].reason_codes == ["NO_LINKED_HAZARD_EVIDENCE"]


def test_service_resolves_red_from_linked_hazard(db_session, habitation, demo_world):
    from backend.services.hazard_status import HazardStatusService

    results = HazardStatusService(db_session).for_habitation(habitation.id)
    flood = next(r for r in results if r.hazard_type == "flood")
    assert flood.status == HazardStatus.RED
    assert flood.severity_score == 80.0
    assert flood.source_name is None  # no evidence row yet - honest about it
    overall = HazardStatusService(db_session).overall(habitation.id)
    assert overall.status == HazardStatus.RED


def test_service_marks_stale_evidence_data_unavailable(db_session, habitation, demo_world):
    from backend.services.hazard_status import HazardStatusService

    db_session.add(Evidence(
        hazard_id=demo_world["hazard"].id,
        source_name="IMD",
        source_url="https://imd.gov.in/demo",
        evidence_type="flood",
        summary="Old flood warning",
        evidence_payload={"severity": "high"},
        data_origin=DataOrigin.REAL,
    ))
    db_session.commit()
    # backdate the evidence past the flood staleness limit
    row = db_session.query(Evidence).order_by(Evidence.id.desc()).first()
    row.created_at = datetime.now(timezone.utc) - timedelta(hours=96)
    db_session.commit()
    db_session.expire_all()

    results = HazardStatusService(db_session).for_habitation(habitation.id)
    flood = next(r for r in results if r.hazard_type == "flood")
    assert flood.status == HazardStatus.DATA_UNAVAILABLE
    assert "EVIDENCE_STALE" in flood.reason_codes
    assert flood.is_stale is True
