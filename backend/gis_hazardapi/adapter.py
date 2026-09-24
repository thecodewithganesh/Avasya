"""Bridge between AVASYA's PostGIS tables and the teammate's HazardEngine.

This adapter is the ONLY integration code touching the vendored engine:
- reads hazard geometries (projected to a planar metre CRS for the planar
  intersection the engine performs — the engine README itself requires
  projection before planar intersection),
- converts them to engine dataclasses,
- returns engine HazardResult rows which the caller (routes/services) can
  persist or expose over the API.

Coastal clamp: coastal hazards (storm surge, coastal erosion, cyclone, sea
level) are intersected only against their coastal footprint — the geometry is
clamped to the supplied coast geometry so a surge zone never extends inland
past the coastline ("starts and stops at the coast").
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable, Sequence

from backend.gis_hazardapi.engine import HazardEngine
from backend.gis_hazardapi.models import Habitation as EngineHabitation
from backend.gis_hazardapi.models import HazardFeature as EngineHazardFeature
from backend.gis_hazardapi.models import HazardResult as EngineHazardResult

COASTAL_HAZARDS = frozenset({"storm_surge", "coastal_erosion", "cyclone", "sea_level_rise", "coastal_flood"})

# South India UTM zones: 44N (80E-84E), 43N (72E-78E). Puducherry/TN/AP fall in 44N,
# Kerala's west coast mostly in 43N. EPSG:7755 (India NSF LCC) covers all of India
# with low distortion; use it as the single planar working CRS.
WORKING_CRS = "EPSG:7755"


def _to_shapely(geom: Any):
    """Parse any persisted geometry form into a shapely shape."""
    from shapely.geometry import shape
    from shapely import wkb as shapely_wkb

    if geom is None:
        raise ValueError("geometry is missing")
    if isinstance(geom, dict) and "type" in geom:
        return shape(geom)
    if hasattr(geom, "geom_type") or hasattr(geom, "exterior"):
        return geom  # already a shapely shape
    raw = geom
    if isinstance(raw, memoryview):
        raw = bytes(raw)
    if isinstance(raw, str):
        hexlike = raw.removeprefix("\\x").removeprefix("x")
        try:
            return shapely_wkb.loads(bytes.fromhex(hexlike))
        except ValueError:
            from shapely import wkt as shapely_wkt

            return shapely_wkt.loads(raw.split(";", 1)[-1])
    from geoalchemy2.shape import to_shape

    return to_shape(geom)


def _project(geom, target_crs: str = WORKING_CRS):
    """Reproject a shapely geometry to the planar working CRS (metres)."""
    crs = getattr(geom, "crs", None)
    if crs is None or crs.to_epsg() != int(target_crs.split(":")[1]):
        from pyproj import Transformer

        transformer = Transformer.from_crs("EPSG:4326", target_crs, always_xy=True)
        from shapely.ops import transform as shapely_transform

        return shapely_transform(transformer.transform, geom)
    return geom


def _polygon_coords(geom, target_crs: str = WORKING_CRS) -> list[list[float]]:
    """Convert a (projected) shapely geometry to the engine's [[x, y], ...] polygon form."""
    # Bare shapely geometries carry no CRS metadata; treat them as WGS84
    # degrees (the demo/ingest convention) and project to the planar CRS.
    needs_projection = getattr(geom, "crs", None) is None or (geom.crs.to_epsg() or 4326) == 4326
    p = _project(geom, target_crs) if needs_projection else geom
    if p.geom_type == "Point":
        # Degenerate hazard point: buffer to a small metre square so the
        # planar intersection still operates on an area.
        p = p.buffer(25.0)  # 25 m — point-hazard uncertainty envelope
    hull = p.convex_hull if p.geom_type not in ("Polygon", "MultiPolygon") else p
    poly = hull if hull.geom_type == "Polygon" else hull.convex_hull
    coords = list(poly.exterior.coords)
    return [[float(x), float(y)] for x, y in coords]


def coastal_clamp(geom, coast, coastal_types: Iterable[str] = COASTAL_HAZARDS) -> tuple[Any, bool]:
    """Clamp a coastal hazard footprint to the coast geometry.

    Returns (clamped_geometry, was_clamped). For storm surge / erosion the
    hazard zone physically cannot extend inland past the shoreline, so the
    inland remainder is removed. Non-coastal hazards pass through unchanged.
    """
    if geom is None:
        raise ValueError("geometry is missing")
    hazard_type = (geom.get("hazard_type") if isinstance(geom, dict) else "") or ""
    if hazard_type not in set(coastal_types) or coast is None:
        return geom, False
    g = _to_shapely(geom) if not isinstance(geom, dict) else _to_shapely(geom.get("geometry", geom))
    clipped = g.intersection(coast)
    if clipped.is_empty:
        return g, False
    return clipped, True


def assess_records(
    hazard_rows: Sequence[dict[str, Any]],
    habitation_rows: Sequence[dict[str, Any]],
    *,
    coast_geometry: Any | None = None,
    current_window_days: int = 7,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Run the teammate's engine over DB-shaped records.

    hazard_rows: dicts with hazard_id, hazard_type, geometry, observed_at,
                 severity (0-1), source.
    habitation_rows: dicts with habitation_id, name, geometry, population.
    coast_geometry: optional coast polygon/multipolygon in EPSG:4326; coastal
                 hazards are clamped to it (start and stop at the coast).

    Returns plain dicts (engine HazardResult.as_dict() plus the persisted
    input provenance so responses keep source/timestamp next to the verdict).
    """
    now = now or datetime.now(timezone.utc)
    hazards: list[EngineHazardFeature] = []
    clamp_log: dict[str, bool] = {}
    for row in hazard_rows:
        geom = row["geometry"]
        g = _to_shapely(geom)
        if coast_geometry is not None:
            hazard_type = str(row.get("hazard_type", ""))
            if hazard_type in COASTAL_HAZARDS:
                coast_shapely = _to_shapely(coast_geometry) if not hasattr(coast_geometry, "intersection") else coast_geometry
                # Both sides are treated as WGS84 degrees (ingest convention).
                g4326 = g
                coast4326 = coast_shapely
                clipped = g4326.intersection(coast4326)
                if not clipped.is_empty:
                    g = clipped
                    clamp_log[str(row["hazard_id"])] = True
        observed = row.get("observed_at")
        if isinstance(observed, str):
            observed = datetime.fromisoformat(observed)
        hazards.append(EngineHazardFeature(
            hazard_id=str(row["hazard_id"]),
            hazard_type=str(row.get("hazard_type", "unknown")),
            geometry=tuple(tuple(pt) for pt in _polygon_coords(g)),
            observed_at=observed,
            severity=float(row["severity"]) if row.get("severity") is not None else None,
            source=row.get("source"),
            properties=row.get("properties", {}),
        ))

    habitations = [
        EngineHabitation(
            habitation_id=str(row["habitation_id"]),
            name=str(row.get("name", "")),
            geometry=tuple(tuple(pt) for pt in _polygon_coords(_to_shapely(row["geometry"]) if not isinstance(row["geometry"], dict) else _to_shapely(row["geometry"]))),
            population=row.get("population"),
            properties=row.get("properties", {}),
        )
        for row in habitation_rows
    ]

    engine = HazardEngine(current_window=__import__("datetime").timedelta(days=current_window_days))
    results: list[dict[str, Any]] = []
    for result in engine.assess(hazards, habitations, now=now):
        payload = result.as_dict()
        payload["coast_clamped"] = clamp_log.get(str(payload["habitation_id"]), False) or any(
            clamp_log.get(h["hazard_id"], False) for h in hazard_rows if str(h.get("hazard_type")) == payload["hazard_type"]
        )
        results.append(payload)
    return results
