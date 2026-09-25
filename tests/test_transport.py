from __future__ import annotations

import pytest

from backend.services.transport import TransportService, haversine_km


def test_haversine_known_distance():
    # Bengaluru city centre ~ 12.9716N 77.5946E; point ~11km north
    distance = haversine_km(12.9716, 77.5946, 13.0700, 77.5946)
    assert 10.0 < distance < 11.5


def test_capacity_gate_excludes_insufficient_destination(db_session, habitation, demo_world):
    plan = TransportService(db_session).plan(habitation.id, habitation.population)
    ids = [plan.recommended_destination_id] + [o.destination_id for o in plan.alternatives]
    assert demo_world["insufficient"].id not in ids
    assert demo_world["eligible"].id in ids


def test_no_feasible_route_when_everything_fails_capacity(db_session):
    from backend.models import CapacityAssessment, Destination, Habitation
    from backend.models.enums import DataOrigin

    hab = Habitation(
        name="Lonely", district="d", state="s", country="India",
        latitude=15.0, longitude=76.0,
        geom="SRID=4326;POINT(76 15)",
        population=500, households=100, data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(hab)
    db_session.flush()
    dest = Destination(
        name="Too Small", district="d", state="s", country="India",
        geom="SRID=4326;POINT(76.01 15.01)",
        capacity_total=10, capacity_available=10, risk_score=10.0,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(dest)
    db_session.flush()
    db_session.add(CapacityAssessment(
        destination_id=dest.id, habitation_id=hab.id,
        nominal_capacity=10, existing_occupancy=0,
        required_capacity=500, usable_capacity=10, capacity_gap=-490,
        status="INSUFFICIENT", data_origin=DataOrigin.SYNTHETIC_DEMO,
    ))
    db_session.commit()

    plan = TransportService(db_session).plan(hab.id, 500)
    assert plan.recommended_route is None
    assert any("NO_FEASIBLE_ROUTE" in lim for lim in plan.limitations)


def test_blocked_route_evidence_excludes_destination(db_session, habitation, demo_world):
    from backend.models import Evidence
    from backend.models.enums import DataOrigin

    db_session.add(Evidence(
        source_name="NDMA Road Closure Feed",
        evidence_type="road_closure",
        evidence_payload={"destination_id": str(demo_world["eligible"].id), "segment": "NH-75 km 42"},
        data_origin=DataOrigin.REAL,
    ))
    db_session.commit()

    plan = TransportService(db_session).plan(habitation.id, habitation.population)
    ids = [plan.recommended_destination_id] + [o.destination_id for o in plan.alternatives]
    assert demo_world["eligible"].id not in ids


def test_habitation_without_coordinates_raises(db_session):
    from backend.models import Habitation
    from backend.models.enums import DataOrigin

    hab = Habitation(
        name="No Coords", district="d", state="s", country="India",
        population=100, households=20, data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(hab)
    db_session.commit()

    with pytest.raises(ValueError, match="no coordinates"):
        TransportService(db_session).plan(hab.id, 100)


def test_cost_prefers_lower_hazard_route(db_session, habitation, demo_world):
    plan = TransportService(db_session).plan(habitation.id, habitation.population)
    assert plan.recommended_route is not None
    # eligible shelter (risk 30) is the only capacity-passing candidate
    assert plan.recommended_route.destination_id == demo_world["eligible"].id
    assert plan.recommended_route.capacity_sufficient is True
    assert plan.recommended_route.travel_time_hours is not None
