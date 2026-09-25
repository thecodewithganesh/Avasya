"""Vendored spatial-temporal hazard assessment engine (teammate module).

Public surface:
  - HazardEngine       (engine.py)  — spatial intersection + temporal analysis
  - assess_records     (adapter.py) — DB-shaped records -> engine -> dicts
  - coastal_clamp      (adapter.py) — coastal hazard footprint clamping
  - spatial predicates (spatial.py) — planar point/polygon intersection
  - domain models      (models.py)  — HazardFeature / Habitation / HazardResult
"""

from .adapter import COASTAL_HAZARDS, assess_records, coastal_clamp
from .engine import HazardEngine
from .models import AlertLevel, Habitation, HazardFeature, HazardResult
from .spatial import geometry_intersects, normalize_polygon, point_in_polygon, polygons_intersect

__all__ = [
    "COASTAL_HAZARDS",
    "AlertLevel",
    "Habitation",
    "HazardEngine",
    "HazardFeature",
    "HazardResult",
    "assess_records",
    "coastal_clamp",
    "geometry_intersects",
    "normalize_polygon",
    "point_in_polygon",
    "polygons_intersect",
]
