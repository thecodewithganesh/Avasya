from __future__ import annotations

from backend.services.hazard_status import HazardStatus
from backend.services.response_time import compute_urgency


def test_red_is_immediate():
    urgency, reasons = compute_urgency(HazardStatus.RED, 1200, 2.0)
    assert urgency == "IMMEDIATE"
    assert "RED_HAZARD_STATUS" in reasons


def test_yellow_is_short_term():
    urgency, _ = compute_urgency(HazardStatus.YELLOW, 1200, 2.0)
    assert urgency == "SHORT_TERM"


def test_yellow_small_population_is_medium_term():
    urgency, reasons = compute_urgency(HazardStatus.YELLOW, 150, None)
    assert urgency == "MEDIUM_TERM"
    assert "YELLOW_HAZARD_STATUS_SMALL_POPULATION" in reasons


def test_no_alert_is_monitor():
    urgency, reasons = compute_urgency(HazardStatus.NO_ALERT, 1200, None)
    assert urgency == "MONITOR"
    assert "NO_ALERT_EVIDENCE_CHECKED" in reasons


def test_data_unavailable_is_scheduled_review_not_silence():
    urgency, reasons = compute_urgency(HazardStatus.DATA_UNAVAILABLE, 1200, None)
    assert urgency == "MEDIUM_TERM"
    assert "HAZARD_STATUS_DATA_UNAVAILABLE_SCHEDULED_REVIEW" in reasons


def test_transport_time_never_lowers_urgency():
    long_travel = compute_urgency(HazardStatus.RED, 1200, 8.0)
    short_travel = compute_urgency(HazardStatus.RED, 1200, 0.5)
    assert long_travel[0] == short_travel[0] == "IMMEDIATE"


def test_urgency_levels_are_locked():
    from backend.services.response_time import URGENCY_LEVELS

    assert URGENCY_LEVELS == {"IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "MONITOR"}
