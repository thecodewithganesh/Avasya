"""Small-footprint spatial helpers for API use.

Coordinates are treated as planar ``(x, y)`` pairs. For production geodesic
work, project WGS84 geometries into a suitable local CRS before calling these
functions, or replace this module with Shapely/GeoPandas adapters.
"""

from __future__ import annotations

from collections.abc import Iterable
try:  # Package import: ``gis.hazardapi.spatial``.
    from .models import Coordinate, Polygon
except ImportError:  # Direct import from a flattened application folder.
    from models import Coordinate, Polygon  # type: ignore


def _cross(a: Coordinate, b: Coordinate, c: Coordinate) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _on_segment(a: Coordinate, b: Coordinate, p: Coordinate, eps: float = 1e-9) -> bool:
    return abs(_cross(a, b, p)) <= eps and min(a[0], b[0]) - eps <= p[0] <= max(a[0], b[0]) + eps and min(a[1], b[1]) - eps <= p[1] <= max(a[1], b[1]) + eps


def point_in_polygon(point: Coordinate, polygon: Polygon) -> bool:
    """Return true for points inside or on the boundary of a simple polygon."""
    if len(polygon) < 3:
        return False
    inside = False
    for index, start in enumerate(polygon):
        end = polygon[(index + 1) % len(polygon)]
        if _on_segment(start, end, point):
            return True
        if (start[1] > point[1]) != (end[1] > point[1]):
            x_at_y = (end[0] - start[0]) * (point[1] - start[1]) / (end[1] - start[1]) + start[0]
            if point[0] < x_at_y:
                inside = not inside
    return inside


def segments_intersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate) -> bool:
    orientations = (_cross(a, b, c), _cross(a, b, d), _cross(c, d, a), _cross(c, d, b))
    if orientations[0] == orientations[1] == orientations[2] == orientations[3] == 0:
        return _on_segment(a, b, c) or _on_segment(a, b, d) or _on_segment(c, d, a) or _on_segment(c, d, b)
    return ((orientations[0] >= 0) != (orientations[1] >= 0)) and ((orientations[2] >= 0) != (orientations[3] >= 0))


def polygons_intersect(first: Polygon, second: Polygon) -> bool:
    """Return true when polygons overlap, touch, or one contains the other."""
    if len(first) < 3 or len(second) < 3:
        return False
    for i, a in enumerate(first):
        b = first[(i + 1) % len(first)]
        for j, c in enumerate(second):
            d = second[(j + 1) % len(second)]
            if segments_intersect(a, b, c, d):
                return True
    return point_in_polygon(first[0], second) or point_in_polygon(second[0], first)


def geometry_intersects(a: Polygon, b: Polygon) -> bool:
    return polygons_intersect(a, b)


def normalize_polygon(points: Iterable[Iterable[float]]) -> Polygon:
    """Validate and normalize JSON-like coordinates into a closed-independent polygon."""
    raw_points = tuple(tuple(point) for point in points)
    if len(raw_points) < 3 or any(len(point) < 2 for point in raw_points):
        raise ValueError("geometry must contain at least three [x, y] coordinates")
    try:
        return tuple((float(point[0]), float(point[1])) for point in raw_points)
    except (TypeError, ValueError) as exc:
        raise ValueError("geometry coordinates must be numeric") from exc
