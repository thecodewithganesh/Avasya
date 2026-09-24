"""Bootstrap the AVASYA demo world from the repository's demo fixtures.

The fixtures in data/raw/ (habitations.geojson, hazards.geojson,
relief_centers.geojson, historical_events.csv, population.csv) are small,
clearly-labelled demonstration datasets. They are loaded with
data_origin = SYNTHETIC_DEMO so the full decision chain can be exercised
end-to-end without the multi-GB real Census archive.

Provenance rule honoured here: nothing in this script claims to be REAL
evidence. Real-data ingestion (Census xlsx, flood inventory, etc.) remains
the job of backend/ingestion/* against the actual authoritative datasets.
"""
from __future__ import annotations

import csv
import json
import os
from pathlib import Path

from geoalchemy2.elements import WKTElement
from sqlalchemy import select

from backend.core.database import SessionLocal
from backend.models import CapacityAssessment, Destination, Evidence, Habitation, Hazard, HabitationHazard
from backend.models.enums import DataOrigin


DEMO_DIR = Path(os.getenv("DATA_DIR", "./data/raw"))


def _load_geojson(name: str) -> list[dict]:
    path = DEMO_DIR / name
    if not path.exists():
        print(f"skip {name}: not present")
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    features = data.get("features")
    if features is not None:
        return features
    # Bare single-geometry files (e.g. coastline.geojson with a top-level
    # "geometry" member) are treated as a one-feature collection.
    if data.get("geometry"):
        return [{"type": "Feature", "properties": data, "geometry": data["geometry"]}]
    return []


def _load_csv(name: str) -> list[dict]:
    path = DEMO_DIR / name
    if not path.exists():
        print(f"skip {name}: not present")
        return []
    with path.open(encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def _representative_point(feature: dict) -> tuple[float | None, float | None]:
    """Return (lon, lat) for Point geometries, or the centroid of a
    Polygon/MultiPolygon's first ring (demo fixtures are small rectangles;
    exact centroid math is unnecessary for SYNTHETIC_DEMO placement)."""
    geometry = feature.get("geometry") or {}
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Point" and coords:
        return float(coords[0]), float(coords[1])
    if gtype == "Polygon" and coords:
        ring = coords[0]
        lon = sum(point[0] for point in ring) / len(ring)
        lat = sum(point[1] for point in ring) / len(ring)
        return lon, lat
    if gtype == "MultiPolygon" and coords:
        ring = coords[0][0]
        lon = sum(point[0] for point in ring) / len(ring)
        lat = sum(point[1] for point in ring) / len(ring)
        return lon, lat
    return None, None


def main() -> None:
    db = SessionLocal()
    try:
        habitation_by_code: dict[str, Habitation] = {}

        # 1. Habitations (SYNTHETIC_DEMO)
        for feature in _load_geojson("habitations.geojson"):
            props = feature.get("properties", {})
            lon, lat = _representative_point(feature)
            name = str(props.get("name") or props.get("habitation_id"))
            existing = db.scalar(select(Habitation).where(Habitation.name == name))
            if existing is None:
                existing = Habitation(
                    name=name,
                    village_or_ward=props.get("village_or_ward"),
                    district=props.get("district"),
                    state=props.get("state"),
                    country="India",
                    latitude=float(lat) if lat is not None else None,
                    longitude=float(lon) if lon is not None else None,
                    geom=WKTElement(f"SRID=4326;POINT({lon} {lat})", srid=4326)
                    if lat is not None and lon is not None
                    else None,
                    population=int(props.get("population") or 0),
                    households=int(props.get("households") or 0),
                    data_origin=DataOrigin.SYNTHETIC_DEMO,
                )
                db.add(existing)
                db.flush()
            habitation_by_code[str(props.get("habitation_id"))] = existing

        # 2. Hazards + habitation links (SYNTHETIC_DEMO)
        for feature in _load_geojson("hazards.geojson"):
            props = feature.get("properties", {})
            lon, lat = _representative_point(feature)
            severity_map = {"high": 85.0, "medium": 50.0, "low": 20.0}
            hazard_type = str(props.get("hazard_type") or "flood")
            severity = severity_map.get(str(props.get("hazard_level", "")).lower(), None)
            # Link to the first demo habitation when the fixture gives no link
            target_code = str(props.get("habitation_id") or next(iter(habitation_by_code), ""))
            target = habitation_by_code.get(target_code)
            if target is None:
                continue
            link_exists = db.scalar(
                select(HabitationHazard).where(HabitationHazard.habitation_id == target.id)
            )
            if link_exists is not None:
                continue
            hazard = Hazard(
                hazard_type=hazard_type,
                hazard_name=props.get("name") or f"Demo {hazard_type}",
                description="SYNTHETIC_DEMO hazard fixture - not real evidence",
                severity_score=severity,
                probability_score=float(props["probability_score"]) if props.get("probability_score") else None,
                geom=WKTElement(f"SRID=4326;POINT({lon} {lat})", srid=4326)
                if lat is not None and lon is not None
                else None,
                data_origin=DataOrigin.SYNTHETIC_DEMO,
            )
            db.add(hazard)
            db.flush()
            db.add(HabitationHazard(habitation_id=target.id, hazard_id=hazard.id))
            db.add(Evidence(
                habitation_id=target.id,
                hazard_id=hazard.id,
                source_name="AVASYA demo hazard fixture",
                source_type="geojson",
                evidence_type=hazard_type,
                summary="SYNTHETIC_DEMO demonstration hazard - NOT real evidence",
                evidence_payload={"data_source": "SYNTHETIC_DEMO", "hazard_level": props.get("hazard_level")},
                external_reference=f"demo-hazard-{hazard_type}",
                data_origin=DataOrigin.SYNTHETIC_DEMO,
            ))

        # 3. Relief centers -> destinations with capacity assessments (SYNTHETIC_DEMO)
        habitation_ids = list(habitation_by_code.values())
        for feature in _load_geojson("relief_centers.geojson"):
            props = feature.get("properties", {})
            lon, lat = _representative_point(feature)
            name = str(props.get("name") or props.get("center_id"))
            existing = db.scalar(select(Destination).where(Destination.name == name))
            if existing is not None:
                continue
            capacity = int(props.get("capacity") or 0)
            destination = Destination(
                name=name,
                destination_type="RELIEF_CENTER",
                district=habitation_ids[0].district if habitation_ids else None,
                state=habitation_ids[0].state if habitation_ids else None,
                country="India",
                geom=WKTElement(f"SRID=4326;POINT({lon} {lat})", srid=4326)
                if lat is not None and lon is not None
                else WKTElement("SRID=4326;POINT(78 12)", srid=4326),
                capacity_total=capacity,
                capacity_available=capacity,
                risk_score=float(props.get("risk_score") or 15.0),
                data_origin=DataOrigin.SYNTHETIC_DEMO,
            )
            db.add(destination)
            db.flush()
            # Capacity assessment against every demo habitation
            for habitation in habitation_ids:
                required = max(1, habitation.population or habitation.households or 1)
                usable = capacity  # empty shelter: nominal == usable
                db.add(CapacityAssessment(
                    destination_id=destination.id,
                    habitation_id=habitation.id,
                    nominal_capacity=capacity,
                    existing_occupancy=0,
                    water_constraint=0,
                    sanitation_constraint=0,
                    safety_reserve=0,
                    required_capacity=required,
                    usable_capacity=usable,
                    capacity_gap=usable - required,
                    status="ELIGIBLE" if usable >= required else "INSUFFICIENT",
                    assessment_details={"synthetic_demo": True},
                    data_origin=DataOrigin.SYNTHETIC_DEMO,
                ))

        # 4. Historical events as habitation-linked evidence (SYNTHETIC_DEMO)
        for row in _load_csv("historical_events.csv"):
            habitation = habitation_by_code.get(str(row.get("habitation_id")))
            if habitation is None:
                continue
            payload = {
                "event_type": row.get("event_type"),
                "event_year": row.get("event_year"),
                "severity": row.get("severity"),
                "data_source": "SYNTHETIC_DEMO",
            }
            import hashlib

            external = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
            exists = db.scalar(
                select(Evidence).where(
                    Evidence.habitation_id == habitation.id,
                    Evidence.external_reference == external,
                )
            )
            if exists is not None:
                continue
            db.add(Evidence(
                habitation_id=habitation.id,
                source_name="AVASYA demo historical events fixture",
                source_type="csv",
                evidence_type="historical_events",
                summary=f"SYNTHETIC_DEMO historical {row.get('event_type')} {row.get('event_year')}",
                evidence_payload=payload,
                external_reference=external,
                data_origin=DataOrigin.SYNTHETIC_DEMO,
            ))

        # 5. Coastline (SYNTHETIC_DEMO): coastal hazard zones clamp to it so
        # they start and stop at the coast. Real ingestion replaces this.
        coast_feature = _load_geojson("coastline.geojson")
        if coast_feature:
            coast_geom = coast_feature[0].get("geometry")
            existing_coast = db.scalar(
                select(Evidence).where(Evidence.evidence_type == "coastline")
            )
            if existing_coast is None:
                db.add(Evidence(
                    source_name="AVASYA demo coastline fixture",
                    source_type="geojson",
                    evidence_type="coastline",
                    summary="SYNTHETIC_DEMO coastline - NOT a surveyed shoreline",
                    evidence_payload={
                        "data_source": "SYNTHETIC_DEMO",
                        "geometry": coast_geom,
                    },
                    external_reference="demo-coastline",
                    data_origin=DataOrigin.SYNTHETIC_DEMO,
                ))

        db.commit()
        counts = {
            "habitations": len(habitation_by_code),
            "destinations": len(db.scalars(select(Destination)).all()),
        }
        print({"bootstrap": "complete", "data_origin": "SYNTHETIC_DEMO", **counts})
    finally:
        db.close()


if __name__ == "__main__":
    main()
