"""Hazard-zone service tests (AVASYA OPERATIONAL METHODOLOGY zones).

Verifies:
- severity -> band mapping (RED >= 75, YELLOW 50-74, BROWN 25-49, GREEN < 25)
- no zone is invented for hazards without geometry or scores
- coastal hazards are clamped to the coastline (start and stop at the coast)
- non-coastal hazards are never clamped
- habitations inside RED/YELLOW zones are reported as traffic-risk locations
- every emitted zone keeps its data_origin provenance (SYNTHETIC_DEMO stays labelled)
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from shapely.geometry import Point, shape

from backend.models import CapacityAssessment, Destination, Evidence, Habitation, Hazard, HabitationHazard
from backend.models.enums import DataOrigin
from backend.services.hazard_zones import (
    BAND_RADII_M,
    BAND_SEVERITY_WINDOWS,
    build_hazard_zones,
)


# Geometry columns are stored as WKT text in the suite's in-memory engine
# (see conftest). The zone service resolves geometry through geoalchemy2's
# to_shape, which accepts WKTElement; tests seed WKT strings for parity with
# the other suites. PostGIS behaviour is exercised by the live docker path.
def _seed(db, *, hazard_type: str, severity: float, lon: float, lat: float, with_geom: bool = True):
    hazard = Hazard(
        hazard_type=hazard_type,
        hazard_name=f"test {hazard_type}",
        severity_score=severity,
        probability_score=None,
        geom=f"SRID=4326;POINT({lon} {lat})" if with_geom else None,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db.add(hazard)
    db.flush()
    return hazard


def _seed_coast(db):
    db.add(Evidence(
        source_name="test coastline",
        source_type="test",
        evidence_type="coastline",
        summary="test coast polygon",
        evidence_payload={"geometry": {
            "type": "Polygon",
            "coordinates": [[[80.29, 12.95], [80.13, 13.50], [80.30, 13.50], [80.42, 12.95], [80.29, 12.95]]],
        }},
        external_reference="test-coast",
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    ))
    db.flush()


def test_band_windows_documented():
    assert BAND_SEVERITY_WINDOWS["red"] == (75.0, 100.0)
    assert BAND_SEVERITY_WINDOWS["yellow"][0] == 50.0
    assert BAND_SEVERITY_WINDOWS["brown"][0] == 25.0
    assert BAND_SEVERITY_WINDOWS["green"] == (0.0, 25.0)


def test_no_zones_without_geometry(db_session):
    _seed(db_session, hazard_type="flood", severity=90.0, lon=80.20, lat=13.40, with_geom=False)
    collection = build_hazard_zones(db_session)
    assert collection.zones == []


def test_red_zone_created_for_high_severity(db_session):
    _seed(db_session, hazard_type="flood", severity=90.0, lon=80.20, lat=13.40)
    collection = build_hazard_zones(db_session)
    assert len(collection.zones) == 1
    props = collection.zones[0]["properties"]
    assert props["band"] == "red"
    assert props["data_origin"] == "SYNTHETIC_DEMO"
    assert props["radius_m"] == BAND_RADII_M["red"]


def test_storm_surge_zone_clamped_to_coast(db_session):
    """A coastal hazard's zone must never extend past the shoreline."""
    _seed_coast(db_session)
    # Shore runs NE-SW through (80.174, 13.35). This evidence point sits ~700 m
    # inland, so the RED band (900 m radius) crosses the shoreline and must be
    # clipped to the land side (starts and stops at the coast).
    hazard = _seed(db_session, hazard_type="storm_surge", severity=95.0, lon=80.18, lat=13.35)
    collection = build_hazard_zones(db_session)
    zone = next(z for z in collection.zones if z["properties"]["hazard_id"] == hazard.id)
    geom = shape(zone["geometry"])
    red_radius_m = BAND_RADII_M["red"]
    unclamped = Point(80.18, 13.35).buffer(red_radius_m / 111_320.0)
    assert geom.area < unclamped.area
    assert zone["properties"]["coast_clamped"] is True
    assert collection.coast_clamped_count == 1


def test_landslide_zone_never_clamped(db_session):
    _seed_coast(db_session)
    hazard = _seed(db_session, hazard_type="landslide", severity=95.0, lon=80.25, lat=13.435)
    collection = build_hazard_zones(db_session)
    zone = next(z for z in collection.zones if z["properties"]["hazard_id"] == hazard.id)
    assert zone["properties"]["coast_clamped"] is False
    assert collection.coast_clamped_count == 0


def test_traffic_location_reported_inside_red_zone(db_session):
    hazard = _seed(db_session, hazard_type="flood", severity=90.0, lon=80.205, lat=13.405)
    habitation = Habitation(
        name="Traffic Test Village",
        latitude=13.405,
        longitude=80.205,
        geom="SRID=4326;POINT(80.205 13.405)",
        population=300,
        data_origin=DataOrigin.SYNTHETIC_DEMO,
    )
    db_session.add(habitation)
    db_session.flush()
    db_session.add(HabitationHazard(habitation_id=habitation.id, hazard_id=hazard.id))
    db_session.flush()
    collection = build_hazard_zones(db_session)
    assert any(t["name"] == "Traffic Test Village" and t["band"] == "red" for t in collection.traffic_locations)


def test_coastline_missing_means_not_clamped(db_session):
    hazard = _seed(db_session, hazard_type="storm_surge", severity=95.0, lon=80.18, lat=13.35)
    collection = build_hazard_zones(db_session)
    assert collection.coast_available is False
    assert any("NOT coast-clamped" in limitation for limitation in collection.limitations)
