"""Context builder tests: the structured context only carries AVASYA facts.

Missing values stay missing (None / empty list) — never guessed substitutes.
"""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from ai.llm.context_builder import build_structured_context
from backend.models import (
    CapacityAssessment,
    Destination,
    Habitation,
    Hazard,
    HabitationHazard,
    RiskAssessment,
)
from backend.models.enums import DataOrigin


@pytest.fixture
def habitation(db_session: Session) -> Habitation:
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


def test_context_reports_risk_when_present(db_session: Session, habitation: Habitation) -> None:
    db_session.add(
        RiskAssessment(
            habitation_id=habitation.id,
            overall_risk_score=67.0,
            risk_level="MEDIUM",
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.flush()
    context = build_structured_context(db_session, habitation.id)
    assert context["population"] == 1240
    assert context["risk_score"] == 67.0
    assert context["risk_level"] == "MEDIUM"
    assert context["data_origin"] == "SYNTHETIC_DEMO"


def test_context_honest_absence_of_risk(db_session: Session, habitation: Habitation) -> None:
    context = build_structured_context(db_session, habitation.id)
    assert context["risk_score"] is None
    assert context["risk_level"] is None


def test_context_destinations_empty_not_invented(db_session: Session, habitation: Habitation) -> None:
    context = build_structured_context(db_session, habitation.id)
    assert context["destinations"] == []


def test_context_includes_capacity_with_eligibility(db_session: Session, habitation: Habitation) -> None:
    destination = Destination(
        name="Relief Center North",
        geom="SRID=4326;POINT(80.21 13.42)",
        capacity_total=1800,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(destination)
    db_session.flush()
    db_session.add(
        CapacityAssessment(
            destination_id=destination.id,
            habitation_id=habitation.id,
            nominal_capacity=1800,
            existing_occupancy=0,
            water_constraint=0,
            sanitation_constraint=0,
            safety_reserve=0,
            required_capacity=1240,
            usable_capacity=1800,
            capacity_gap=560,
            status="ELIGIBLE",
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.flush()
    context = build_structured_context(db_session, habitation.id)
    assert context["destinations"][0]["eligible"] is True
    assert context["destinations"][0]["usable_capacity"] == 1800


def test_context_includes_hazard_status(db_session: Session, habitation: Habitation) -> None:
    hazard = Hazard(
        hazard_name="Demo flood",
        hazard_type="flood",
        severity_score=85.0,
        geom="SRID=4326;POINT(80.204 13.404)",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(hazard)
    db_session.flush()
    db_session.add(
        HabitationHazard(
            habitation_id=habitation.id,
            hazard_id=hazard.id,
        )
    )
    db_session.flush()
    context = build_structured_context(db_session, habitation.id)
    status = context["hazard_status"]
    assert status["status"] in {"RED", "YELLOW", "NO_ALERT", "DATA_UNAVAILABLE"}


def test_context_missing_habitation_raises(db_session: Session) -> None:
    with pytest.raises(ValueError):
        build_structured_context(db_session, 99999)
