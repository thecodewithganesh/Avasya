from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import Any

from geoalchemy2.shape import to_shape


EARTH_RADIUS_KM = 6371.0


def parse_any_geometry(geom: Any) -> Any:
    """Parse any persisted geometry form into a shapely shape.

    Handles the production psycopg path (geoalchemy2 WKBElement), the SQLite
    dev/test stack (SRID-prefixed WKT strings), WKTElement, GeoJSON dicts, and
    raw shapely shapes. Raises ValueError for missing/unparseable geometry so
    callers can skip the feature instead of inventing one (or 500-ing).
    """
    if geom is None:
        raise ValueError("geometry is missing")
    if isinstance(geom, dict) and "type" in geom:
        from shapely.geometry import shape

        return shape(geom)
    if hasattr(geom, "geom_type") or hasattr(geom, "exterior"):
        return geom  # already a shapely shape
    if isinstance(geom, str):
        wkt = geom.split(";", 1)[1] if ";" in geom else geom
        from shapely import wkt as shapely_wkt

        return shapely_wkt.loads(wkt)
    try:
        return to_shape(geom)
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"geometry could not be parsed: {exc}") from exc


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km, rounded to metres. Used only as a
    straight-line proxy where road-network geometry is not loaded; callers
    must document that limitation (see services/transport.py)."""
    d_lat = radians(lat2 - lat1)
    d_lon = radians(lon2 - lon1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return round(2 * EARTH_RADIUS_KM * asin(sqrt(a)), 3)


def geom_lat_lon(geom: Any) -> tuple[float, float]:
    """Extract (lat, lon) from a PostGIS geometry column value.

    Production rows arrive from psycopg as geoalchemy2 WKBElement (hex-encoded
    WKB), so the reliable path is geoalchemy2.shape.to_shape -> shapely Point.
    WKT strings and SRID-prefixed WKT ("SRID=4326;POINT(...)") are handled too
    (they occur in the SQLite test stack and seed scripts). Raises ValueError
    when the geometry is missing/unparseable so callers surface
    DATA_UNAVAILABLE instead of a fake coordinate.
    """
    if geom is None:
        raise ValueError("Geometry is missing")

    # WKTElement / WKT string forms (test stack + seeds)
    if hasattr(geom, "desc") and not hasattr(geom, "srid"):
        wkt = geom.desc
    elif isinstance(geom, str):
        wkt = geom
    elif hasattr(geom, "wkt") and geom.wkt:
        wkt = geom.wkt
    else:
        wkt = None

    if wkt:
        if ";" in wkt:
            wkt = wkt.split(";", 1)[1]
        upper = wkt.upper().strip()
        if upper.startswith("POINT"):
            inner = wkt[wkt.index("(") + 1: wkt.rindex(")")]
            lon_s, lat_s = [part.strip() for part in inner.split()[:2]]
            return float(lat_s), float(lon_s)

    # WKBElement / WKB binary / hex-WKB (production psycopg path)
    try:
        shape = to_shape(geom)
    except Exception:
        try:
            from shapely import wkb as shapely_wkb

            raw = geom
            if isinstance(raw, memoryview):
                raw = bytes(raw)
            if isinstance(raw, str):
                raw = bytes.fromhex(raw.removeprefix("\\x"))
            shape = shapely_wkb.loads(raw)
        except Exception as exc:  # noqa: BLE001 - surface as data problem
            raise ValueError(f"Geometry could not be parsed: {exc}") from exc

    try:
        return float(shape.y), float(shape.x)
    except AttributeError as exc:
        raise ValueError(f"Geometry is not a point: {type(shape).__name__}") from exc
