from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from shapely.geometry import mapping, shape

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Evidence, Habitation, Hazard
from backend.models.enums import DataOrigin
from backend.services.geometry_utils import parse_any_geometry as _to_shapely

METHODOLOGY_ID = "AVASYA-HAZZONE-COASTAL-V1"

# AVASYA OPERATIONAL METHODOLOGY band radii (metres, around the hazard evidence
# point). NOT official government evacuation zone sizes. Zones are generated
# only where hazard evidence exists; no zone is invented elsewhere.
BAND_RADII_M = {"red": 900.0, "yellow": 1600.0, "brown": 2400.0, "green": 3200.0}

# Band severity windows map from the hazard's severity_score (0-100).
BAND_SEVERITY_WINDOWS = {
    "red": (75.0, 100.0),
    "yellow": (50.0, 75.0),
    "brown": (25.0, 50.0),
    "green": (0.0, 25.0),
}

# Hazards whose footprint is coastal: zones are clamped to the coastline so
# they physically start and stop at the coast (no inland over-reach).
COASTAL_HAZARDS = frozenset({
    "storm_surge", "coastal_erosion", "cyclone", "sea_level_rise", "coastal_flood", "flood",
})

# Traffic-risk hotspots: destination/habitation locations that sit inside a
# RED or YELLOW zone are the emergency-traffic focal points.
TRAFFIC_RISK_BANDS = frozenset({"red", "yellow"})

FEATURE_LIMIT = 200  # response cap so a huge demo/real dataset cannot explode the payload


@dataclass
class HazardZoneCollection:
    zones: list[dict[str, Any]] = field(default_factory=list)
    traffic_locations: list[dict[str, Any]] = field(default_factory=list)
    methodology: str = METHODOLOGY_ID
    data_origin: str = "SYNTHETIC_DEMO"
    limitations: list[str] = field(default_factory=list)
    coast_clamped_count: int = 0
    coast_available: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "type": "FeatureCollection",
            "features": self.zones,
            "traffic_locations": self.traffic_locations,
            "methodology": self.methodology,
            "data_origin": self.data_origin,
            "limitations": self.limitations,
            "coast_clamped_count": self.coast_clamped_count,
            "coast_available": self.coast_available,
        }


def _as_float(value: Any) -> float | None:
    try:
        return None if value is None else float(value)
    except (TypeError, ValueError):
        return None


def _severity_band(severity: float | None) -> str | None:
    """Map a 0-100 severity to a zone band; None -> no zone (never invented)."""
    if severity is None:
        return None
    for band, (low, high) in BAND_SEVERITY_WINDOWS.items():
        if low <= severity < high:
            return band
    return None


def _load_coast(db: Session) -> tuple[Any | None, bool]:
    """Load the coastline polygon from spatial evidence (data/raw or ingested).

    Returns (shapely_coast_geometry_or_None, fixture_available).
    """
    row = db.scalar(
        select(Evidence).where(
            Evidence.habitation_id.is_(None),
            Evidence.hazard_id.is_(None),
            Evidence.evidence_type == "coastline",
        ).order_by(Evidence.id.desc())
    )
    if row is None:
        return None, False
    payload = row.evidence_payload or {}
    geojson = payload.get("geometry")
    if not geojson:
        return None, True
    try:
        return shape(geojson), True
    except (ValueError, AttributeError, KeyError):
        return None, True


def _band_color(band: str) -> str:
    # BROWN is the intermediate caution band between YELLOW (evacuation watch)
    # and GREEN (safe): demarcates areas with residual hazard concern that do
    # not warrant alert status, per AVASYA OPERATIONAL METHODOLOGY.
    return {"red": "#E5484D", "yellow": "#F2B33D", "brown": "#8A5A2B", "green": "#3CB371"}.get(band, "#6E7681")


def build_hazard_zones(
    db: Session,
    *,
    hazard_type: str | None = None,
    band: str | None = None,
    now: datetime | None = None,
) -> HazardZoneCollection:
    """Build banded, coast-clamped hazard zones from persisted hazard evidence.

    Only hazards WITH persisted geometry produce zones. Habitations and
    destinations inside RED/YELLOW zones are reported as high-hazard traffic
    locations (emergency-traffic focal points for the map).
    """
    now = now or datetime.now(timezone.utc)
    coast, coast_available = _load_coast(db)

    hazard_rows = list(db.scalars(select(Hazard)).all())
    zones: list[dict[str, Any]] = []
    traffic_locations: list[dict[str, Any]] = []
    clamped_hazard_ids: set[int] = set()
    zone_shapes_by_band: dict[str, list[Any]] = {"red": [], "yellow": []}

    for hazard in hazard_rows:
        if hazard_type and hazard.hazard_type != hazard_type:
            continue
        if hazard.geom is None:
            continue  # no zone invented without geometry
        severity = _as_float(hazard.severity_score)
        band_name = _severity_band(severity)
        if band_name is None:
            continue
        if band and band_name != band:
            continue
        try:
            point = _to_shapely(hazard.geom)
        except ValueError:
            continue
        is_coastal = hazard.hazard_type in COASTAL_HAZARDS
        radius_m = BAND_RADII_M[band_name]
        # Planar buffer in metres via a local UTM-ish approximation is avoided:
        # use shapely buffer in degrees scaled by latitude (demo scale, small
        # distortions acceptable at 3km) — documented as operational limitation.
        lat_rad = math.radians(point.y)
        lat_scale = 111_320.0
        lon_scale = max(1.0, math.cos(lat_rad) * 111_320.0)
        deg_radius = radius_m / lat_scale
        circle = point.buffer(deg_radius, quad_segs=16)
        if is_coastal and coast is not None:
            clipped = circle.intersection(coast)
            if not clipped.is_empty:
                circle = clipped
                clamped_hazard_ids.add(hazard.id)
        zone_shapes_by_band.setdefault(band_name, []).append(circle)
        zones.append({
            "type": "Feature",
            "id": f"zone-{hazard.id}-{band_name}",
            "properties": {
                "zone_id": f"zone-{hazard.id}-{band_name}",
                "hazard_id": hazard.id,
                "hazard_type": hazard.hazard_type,
                "band": band_name,
                "severity_score": severity,
                "band_color": _band_color(band_name),
                "radius_m": radius_m,
                "coast_clamped": hazard.id in clamped_hazard_ids,
                "source": "AVASYA hazard evidence",
                "data_origin": hazard.data_origin.value,
                "provenance": hazard.data_origin.value,
            },
            "geometry": mapping(circle),
        })

    # High-hazard traffic locations: habitations + destinations inside RED/YELLOW.
    habitations = list(db.scalars(select(Habitation)).all())
    for habitation in habitations:
        if habitation.geom is None:
            continue
        try:
            point = _to_shapely(habitation.geom)
        except ValueError:
            continue
        for zone in zones:
            zone_band = zone["properties"]["band"]
            if zone_band not in TRAFFIC_RISK_BANDS:
                continue
            if point.within(shape(zone["geometry"])):
                traffic_locations.append({
                    "id": f"traffic-hab-{habitation.id}",
                    "kind": "HABITATION",
                    "name": habitation.name,
                    "coordinates": [habitation.longitude, habitation.latitude],
                    "population": habitation.population,
                    "band": zone_band,
                    "hazard_type": zone["properties"]["hazard_type"],
                    "data_origin": habitation.data_origin.value,
                })
                break

    # Merged view of each band for a cleaner map legend
    return HazardZoneCollection(
        zones=zones[:FEATURE_LIMIT],
        traffic_locations=traffic_locations[:FEATURE_LIMIT],
        methodology=METHODOLOGY_ID,
        data_origin=DataOrigin.SYNTHETIC_DEMO.value if zones and all(
            z["properties"]["data_origin"] == "SYNTHETIC_DEMO" for z in zones
        ) else "MIXED",
        limitations=[
            "Band radii are AVASYA OPERATIONAL METHODOLOGY, not official evacuation zone sizes.",
            "Coastal zones are clamped to the coastline where coastline evidence exists."
            if coast_available else
            "No coastline evidence loaded: coastal zones are NOT coast-clamped in this environment.",
        ],
        coast_clamped_count=len(clamped_hazard_ids),
        coast_available=coast_available,
    )
