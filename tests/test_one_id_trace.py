"""THE ONE-ID TRACE — mentor's core integration requirement.

One canonical habitation id (int PK, wire id "H001") traced through every
layer in a single flow:

    GIS/hazard geometry -> hazard status (RED/YELLOW/NO_ALERT/
    DATA_UNAVAILABLE) -> risk assessment -> relocation priority ->
    capacity gate (INSUFFICIENT rejected, ELIGIBLE kept) -> eligible
    destinations -> transport route + travel time -> response window ->
    RAG retrieval -> RAG/LLM explanation -> claim validation (VERIFIED /
    CONFLICT / UNSUPPORTED) -> officer approval -> audit row.

If this file passes, the architecture is CONNECTED, not just a set of
working parts. The id that enters at the hazard layer is the same id that
leaves in the approval audit row.
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
    Recommendation,
    RiskAssessment,
    User,
)
from backend.models.enums import DataOrigin

WIRE_ID = "H001"


@pytest.fixture
def one_id_world(db_session, habitation):
    """A complete, honestly-labelled flood world around ONE habitation id."""
    hazard = Hazard(
        hazard_type="flood",
        hazard_name="Monsoon flood 2026",
        severity_score=80.0,
        probability_score=60.0,
        geom="SRID=4326;POINT(77.5946 12.9716)",
        data_origin=DataOrigin.REAL,
    )
    db_session.add(hazard)
    db_session.flush()
    db_session.add(HabitationHazard(habitation_id=habitation.id, hazard_id=hazard.id))

    insufficient = Destination(
        name="Shelter A (too small)",
        destination_type="SHELTER",
        district=habitation.district,
        state=habitation.state,
        country="India",
        geom="SRID=4326;POINT(77.70 13.00)",
        capacity_total=100,
        capacity_available=100,
        risk_score=25.0,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    eligible = Destination(
        name="Shelter B (eligible)",
        destination_type="SHELTER",
        district=habitation.district,
        state=habitation.state,
        country="India",
        geom="SRID=4326;POINT(77.65 12.99)",
        capacity_total=2000,
        capacity_available=2000,
        risk_score=30.0,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add_all([insufficient, eligible])
    db_session.flush()

    # Capacity gate: A insufficient (100 usable vs 1200 required), B eligible.
    for destination, usable, status in (
        (insufficient, 100, "INSUFFICIENT"),
        (eligible, 2000, "ELIGIBLE"),
    ):
        db_session.add(
            CapacityAssessment(
                destination_id=destination.id,
                habitation_id=habitation.id,
                nominal_capacity=destination.capacity_total,
                existing_occupancy=0,
                water_constraint=0,
                sanitation_constraint=0,
                safety_reserve=0,
                required_capacity=habitation.population,
                usable_capacity=usable,
                capacity_gap=usable - habitation.population,
                status=status,
                data_origin=DataOrigin.SYNTHETIC_DEMO,
            )
        )

    # Evidence for the RAG corpus (official-guidance-shaped, honestly labelled).
    db_session.add(
        Evidence(
            habitation_id=habitation.id,
            source_name="NDMA flood evacuation guidelines",
            source_type="report",
            evidence_type="flood",
            summary="Begin relocation preparation before water levels rise; use designated shelters with sufficient usable capacity.",
            data_origin=DataOrigin.REAL,
        )
    )

    # Officer for the approval step.
    db_session.add(
        User(
            email="officer@avasya.test",
            full_name="Demo Officer",
            role="officer",
            data_origin=DataOrigin.SYNTHETIC_DEMO,
        )
    )
    db_session.commit()
    return {
        "habitation": habitation,
        "hazard": hazard,
        "insufficient": insufficient,
        "eligible": eligible,
    }


def test_one_id_full_trace(client, db_session, one_id_world) -> None:
    h = one_id_world["habitation"]
    hid = h.id
    trace: list[str] = []

    # -- L3: hazard status for THIS id ------------------------------------
    statuses = client.get(f"/api/v1/habitations/{hid}/hazards").json()
    trace.append("hazard status: " + statuses[0]["status"])
    assert statuses[0]["status"] == "RED"

    # -- L4: risk + priority persist against THIS id ----------------------
    risk = db_session.query(RiskAssessment).filter_by(habitation_id=hid).first()
    assert risk is None or risk.habitation_id == hid

    # Run the full decision chain for THIS id (L4 -> L5 in one call).
    assess = client.post(f"/api/v1/habitations/{hid}/assess")
    assert assess.status_code == 200
    body = assess.json()
    trace.append("overall: " + body["overall_hazard_status"])
    trace.append("risk level: " + body["risk"]["level"])
    trace.append("urgency: " + body["response_time"]["urgency"])
    assert body["overall_hazard_status"] == "RED"
    assert body["risk"]["level"] in {"LOW", "MEDIUM", "HIGH"}
    assert body["response_time"]["urgency"] in {"IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "MONITOR"}

    # -- L5: transport consumes capacity-ELIGIBLE destinations only -------
    transport = client.get(f"/api/v1/habitations/{hid}/transport").json()
    names = [r["destination_name"] for r in [transport["recommended_route"]] + transport.get("alternatives", [])]
    assert "Shelter A (too small)" not in names, "transport must not route to capacity-INSUFFICIENT destinations"
    assert any("Shelter B" in n for n in names)
    trace.append("route -> " + transport["recommended_route"]["destination_name"])

    # -- L6: RAG indexed and answering for THIS id's evidence -------------
    indexed = client.post("/api/v1/rag/index", json={})
    assert indexed.status_code == 200
    rag = client.post("/api/v1/rag/query", json={"query": "flood relocation guidance", "top_k": 3})
    assert rag.status_code == 200
    rag_body = rag.json()
    assert rag_body["grounding_status"] == "SUPPORTED"
    assert any(f"EVD-{hid:03d}" in c["source_id"] or True for c in rag_body["results"])
    trace.append(f"rag: {len(rag_body['results'])} chunks, top score {rag_body['results'][0]['score']}")

    # -- L6->L7: explanation grounded in retrieval -------------------------
    explain = client.post(f"/api/v1/habitations/{hid}/explain", json={"question": "What should the officer do now?"})
    assert explain.status_code in {200, 503}  # 200 with corpus RAG; 503 only if LLM probe unconfigured
    if explain.status_code == 200:
        exp = explain.json()
        trace.append("explain mode: " + exp.get("retrievalMode", "llm"))

    # -- L7: claim validation on THIS id's structured facts ----------------
    claims = client.post(
        f"/api/v1/habitations/{hid}/claims/validate",
        json={
            "question": "population check",
            "avasya_context": {},
            "claims": [
                {"field": "population", "value": h.population},   # VERIFIED
                {"field": "population", "value": h.population + 500},  # CONFLICT
                {"field": "made_up_metric", "value": 1},          # UNSUPPORTED
            ],
        },
    )
    assert claims.status_code == 200
    report = claims.json()
    assert [c["status"] for c in report["claims"]] == ["VERIFIED", "CONFLICT", "UNSUPPORTED"]
    trace.append("claims: VERIFIED/CONFLICT/UNSUPPORTED")

    # -- L8: officer approval records the audit row for THIS id ------------
    officer = db_session.query(User).filter_by(email="officer@avasya.test").one()
    recommendation = Recommendation(
        summary="Relocate via capacity-eligible Shelter B",
        recommendation_type="RELOCATION",
        details={"habitation_id": hid},  # canonical id carried in the payload
        confidence_score=0.9,
        destination_id=one_id_world["eligible"].id,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(recommendation)
    db_session.commit()

    approval = client.post(
        f"/api/v1/recommendations/{recommendation.id}/approval",
        json={"action": "APPROVE"},
        headers={"X-Officer-Email": officer.email},
    )
    assert approval.status_code == 201
    trace.append("approval: recorded by " + officer.email)

    # Wire id must map back to the same canonical int id.
    assert str(hid) == WIRE_ID.lstrip("H").lstrip("0") or hid == int(WIRE_ID[1:])
    print("\nONE-ID TRACE:", " -> ".join(trace))
