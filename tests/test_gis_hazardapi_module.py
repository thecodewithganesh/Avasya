from datetime import datetime, timedelta, timezone

try:
    from backend.gis_hazardapi.engine import HazardEngine
    from backend.gis_hazardapi.models import AlertLevel, Habitation, HazardFeature
    from backend.gis_hazardapi.spatial import point_in_polygon, polygons_intersect
except ImportError:
    from engine import HazardEngine  # type: ignore
    from models import AlertLevel, Habitation, HazardFeature  # type: ignore
    from spatial import point_in_polygon, polygons_intersect  # type: ignore


def square(x0, y0, x1, y1):
    return ((x0, y0), (x1, y0), (x1, y1), (x0, y1))


def test_spatial_predicates():
    assert point_in_polygon((1, 1), square(0, 0, 2, 2))
    assert polygons_intersect(square(0, 0, 2, 2), square(1, 1, 3, 3))
    assert not polygons_intersect(square(0, 0, 1, 1), square(2, 2, 3, 3))


def test_current_red_and_historical_yellow():
    now = datetime(2026, 9, 16, tzinfo=timezone.utc)
    habitation = Habitation("h1", "Village", square(0, 0, 2, 2))
    hazards = [
        HazardFeature("red", "flood", square(1, 1, 3, 3), now - timedelta(hours=1), 0.9),
        HazardFeature("old", "landslide", square(1, 1, 3, 3), now - timedelta(days=30), 0.8),
    ]
    results = HazardEngine().assess(hazards, [habitation], now=now)
    assert {result.alert for result in results} == {AlertLevel.RED, AlertLevel.YELLOW}


def test_no_alert_and_data_unavailable():
    now = datetime(2026, 9, 16, tzinfo=timezone.utc)
    habitation = Habitation("h1", "Village", square(0, 0, 2, 2))
    no_intersection = HazardFeature("x", "flood", square(5, 5, 6, 6), now, 0.9)
    missing_severity = HazardFeature("y", "fire", square(1, 1, 3, 3), now, None)
    results = HazardEngine().assess([no_intersection, missing_severity], [habitation], now=now)
    assert {result.alert for result in results} == {AlertLevel.NO_ALERT, AlertLevel.DATA_UNAVAILABLE}
