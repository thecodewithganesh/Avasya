from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.models import Evidence, Hazard, Habitation
from backend.gis_hazardapi.adapter import assess_records
from backend.services.hazard_zones import build_hazard_zones


router = APIRouter(prefix="/api/v1/gis", tags=["AVASYA GIS"])


@router.get(
    "/hazard-zones",
    summary="Banded RED/YELLOW/BROWN/GREEN hazard zones (GeoJSON, coast-clamped for coastal hazards)",
)
def get_hazard_zones(
    hazard_type: str | None = Query(default=None),
    band: str | None = Query(default=None, pattern="^(red|yellow|brown|green)$"),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    collection = build_hazard_zones(db, hazard_type=hazard_type, band=band)
    return collection.to_dict()


@router.get(
    "/traffic-risk",
    summary="High-hazard traffic-risk locations (habitations/destinations inside RED or YELLOW zones)",
)
def get_traffic_risk(db: Session = Depends(get_db)) -> dict[str, Any]:
    collection = build_hazard_zones(db)
    return {
        "traffic_locations": collection.traffic_locations,
        "methodology": collection.methodology,
        "data_origin": collection.data_origin,
        "limitations": collection.limitations,
    }


@router.get(
    "/coastline",
    summary="Coastline availability and geometry status for coastal zone clamping",
)
def get_coastline(db: Session = Depends(get_db)) -> dict[str, Any]:
    collection = build_hazard_zones(db)
    return {
        "coast_available": collection.coast_available,
        "coast_clamped_count": collection.coast_clamped_count,
        "methodology": collection.methodology,
        "limitations": collection.limitations,
    }


@router.get(
    "/hazardapi/assess",
    summary="Spatial-temporal hazard assessment via the vendored teammate hazardapi engine",
)
def hazardapi_assess(habitation_id: int | None = Query(default=None), db: Session = Depends(get_db)) -> dict[str, Any]:
    """Run the teammate's spatial intersection + temporal analysis engine over
    persisted hazard geometry and habitation locations.

    Reads hazard geometry from evidence payloads (polygons, WGS84) where the
    demo ingest stored them; falls back to hazard point geometry buffered by
    the adapter. Every linked habitation is checked against every hazard:
    intersection with evidence -> RED/YELLOW/NO_ALERT; no evidence ->
    DATA_UNAVAILABLE. Missing data is never NO_ALERT.
    """
    hazard_rows = list(db.scalars(select(Hazard)).all())
    habitation_rows = list(db.scalars(select(Habitation)).all())
    if habitation_id is not None:
        habitation_rows = [h for h in habitation_rows if h.id == habitation_id]
        if not habitation_rows:
            raise HTTPException(status_code=404, detail="Habitation not found")

    # Polygon geometry from evidence payloads (the demo ingest persists polygon
    # GeoJSON in evidence_payload.geometry per hazard).
    evidence_by_hazard: dict[int, dict[str, Any]] = {}
    for ev in db.scalars(select(Evidence).where(Evidence.hazard_id.isnot(None))).all():
        payload = ev.evidence_payload or {}
        if payload.get("geometry"):
            evidence_by_hazard[ev.hazard_id] = payload

    engine_hazards: list[dict[str, Any]] = []
    for hazard in hazard_rows:
        payload = evidence_by_hazard.get(hazard.id, {})
        geometry = payload.get("geometry")
        if geometry is None and hazard.geom is not None:
            from shapely.geometry import mapping

            from backend.services.geometry_utils import parse_any_geometry

            try:
                geometry = mapping(parse_any_geometry(hazard.geom))
            except ValueError:
                continue  # unparseable geometry: the engine cannot assess it
        if geometry is None:
            continue  # no geometry: the engine cannot assess; DATA_UNAVAILABLE is emitted per-habitation
        observed = hazard.updated_at or hazard.created_at
        engine_hazards.append({
            "hazard_id": str(hazard.id),
            "hazard_type": hazard.hazard_type,
            "geometry": geometry,
            "observed_at": observed.isoformat() if observed else None,
            "severity": (hazard.severity_score / 100.0) if hazard.severity_score is not None else None,
            "source": payload.get("data_source") or "AVASYA evidence",
            "properties": {"data_origin": hazard.data_origin.value},
        })

    engine_habitats = [
        {
            "habitation_id": str(h.id),
            "name": h.name,
            "geometry": {
                "type": "Point",
                "coordinates": [h.longitude, h.latitude],
            } if h.longitude is not None and h.latitude is not None else None,
            "population": h.population,
            "properties": {"data_origin": h.data_origin.value},
        }
        for h in habitation_rows
        if h.longitude is not None and h.latitude is not None
    ]

    coast_geometry = None
    coast_ev = db.scalar(
        select(Evidence).where(Evidence.evidence_type == "coastline").order_by(Evidence.id.desc())
    )
    if coast_ev is not None and (coast_ev.evidence_payload or {}).get("geometry"):
        coast_geometry = coast_ev.evidence_payload["geometry"]

    if not engine_habitats:
        raise HTTPException(status_code=422, detail="No habitations with persisted coordinates")

    results = assess_records(
        engine_hazards,
        engine_habitats,
        coast_geometry=coast_geometry,
        current_window_days=30,
    )
    return {
        "results": results,
        "methodology": "AVASYA-GIS-HAZARDAPI-V1 (spatial intersection + temporal analysis via teammate hazardapi engine)",
        "coast_clamping_applied": coast_geometry is not None,
    }
