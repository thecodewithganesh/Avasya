"""API tests for /api/v1/gis endpoints."""
from __future__ import annotations

from sqlalchemy import select

from backend.models import Evidence, Hazard, Habitation, HabitationHazard
from backend.models.enums import DataOrigin


def _seed_coast(db):
    db.add(Evidence(
        source_name="test coastline",
        source_type="test",
        evidence_type="coastline",
        summary="test coast",
        evidence_payload={"geometry": {
            "type": "Polygon",
            "coordinates": [[[80.29, 12.95], [80.13, 13.50], [80.30, 13.50], [80.42, 12.95], [80.29, 12.95]]],
        }},
        external_reference="test-coast",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    ))
    db.flush()


def _seed_world(db):
    """Habitation + coastal hazard evidence with real intersecting polygon geometry."""
    habitation = Habitation(
        name="Coastal Test Village",
        latitude=13.35,
        longitude=80.20,
        geom="SRID=4326;POINT(80.20 13.35)",
        population=400,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db.add(habitation)
    db.flush()
    hazard = Hazard(
        hazard_type="storm_surge",
        hazard_name="Surge test",
        severity_score=85.0,
        geom="SRID=4326;POINT(80.20 13.35)",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db.add(hazard)
    db.flush()
    db.add(HabitationHazard(habitation_id=habitation.id, hazard_id=hazard.id))
    # Polygon evidence geometry (GeoJSON in evidence_payload) around the point:
    # a ~500 m square so the engine's spatial intersection actually hits.
    half_deg = 250.0 / 111_320.0
    lon, lat = 80.20, 13.35
    db.add(Evidence(
        habitation_id=habitation.id,
        hazard_id=hazard.id,
        source_name="test surge polygon",
        source_type="test",
        evidence_type="storm_surge",
        summary="polygon evidence",
        evidence_payload={
            "geometry": {
                "type": "Polygon",
                "coordinates": [[[lon - half_deg, lat - half_deg], [lon + half_deg, lat - half_deg],
                                 [lon + half_deg, lat + half_deg], [lon - half_deg, lat + half_deg],
                                 [lon - half_deg, lat - half_deg]]],
            },
            "data_source": "SYNTHETIC_DEMO",
        },
        external_reference="test-surge-poly",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    ))
    db.commit()
    return habitation


def test_hazard_zones_endpoint(client, db_session):
    _seed_coast(db_session)
    _seed_world(db_session)
    response = client.get("/api/v1/gis/hazard-zones")
    assert response.status_code == 200
    payload = response.json()
    assert payload["type"] == "FeatureCollection"
    assert len(payload["features"]) >= 1
    zone = payload["features"][0]["properties"]
    assert zone["band"] in {"red", "yellow", "brown", "green"}
    assert zone["data_origin"] == "SYNTHETIC_DEMO"
    # Coastal hazard + coast loaded -> clamped
    assert zone["coast_clamped"] is True
    assert payload["coast_available"] is True


def test_hazard_zones_band_filter(client, db_session):
    _seed_coast(db_session)
    _seed_world(db_session)
    red_only = client.get("/api/v1/gis/hazard-zones?band=red").json()
    assert all(f["properties"]["band"] == "red" for f in red_only["features"])


def test_traffic_risk_endpoint(client, db_session):
    _seed_coast(db_session)
    habitation = _seed_world(db_session)
    payload = client.get("/api/v1/gis/traffic-risk").json()
    assert any(t["name"] == "Coastal Test Village" for t in payload["traffic_locations"])
    assert payload["data_origin"] == "SYNTHETIC_DEMO"


def test_coastline_endpoint(client, db_session):
    _seed_coast(db_session)
    payload = client.get("/api/v1/gis/coastline").json()
    assert payload["coast_available"] is True


def test_hazardapi_assess_spatial_intersection(client, db_session):
    """The engine must report exposure when the evidence polygon intersects the habitation."""
    _seed_world(db_session)  # no coast seeded: engine path unaffected
    response = client.get("/api/v1/gis/hazardapi/assess")
    assert response.status_code == 200
    payload = response.json()
    assert payload["coast_clamping_applied"] is False
    row = next(r for r in payload["results"] if r["habitation_id"] == "1" or r.get("habitation_name") == "Coastal Test Village")
    assert row["alert"] == "RED"
    assert "spatial intersection" in ",".join(row["reasons"]).lower() or row["current_exposure"] is True


def test_hazardapi_assess_404_for_unknown_habitation(client, db_session):
    response = client.get("/api/v1/gis/hazardapi/assess?habitation_id=9999")
    assert response.status_code == 404
