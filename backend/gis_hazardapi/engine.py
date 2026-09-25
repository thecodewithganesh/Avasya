"""Hazard pipeline: processed data -> spatial intersection -> temporal analysis -> alert."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Iterable

try:  # Package import: ``gis.hazardapi.engine``.
    from .models import AlertLevel, Habitation, HazardFeature, HazardResult
    from .spatial import geometry_intersects
except ImportError:  # Direct import: ``uvicorn api:app`` in a flattened folder.
    from models import AlertLevel, Habitation, HazardFeature, HazardResult  # type: ignore
    from spatial import geometry_intersects  # type: ignore


class HazardEngine:
    """Pure-Python hazard assessor suitable for use behind an HTTP API.

    ``current_window`` controls how recent an observation must be to count as
    current. Thresholds are normalized severity values in the range 0..1.
    """

    def __init__(self, current_window: timedelta = timedelta(days=7), red_threshold: float = 0.75, yellow_threshold: float = 0.4):
        if not 0 <= yellow_threshold <= red_threshold <= 1:
            raise ValueError("thresholds must satisfy 0 <= yellow <= red <= 1")
        self.current_window = current_window
        self.red_threshold = red_threshold
        self.yellow_threshold = yellow_threshold

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def intersect_habitations(self, hazards: Iterable[HazardFeature], habitations: Iterable[Habitation]) -> dict[str, list[HazardFeature]]:
        """Return hazard features intersecting each habitation."""
        matches: dict[str, list[HazardFeature]] = defaultdict(list)
        for habitation in habitations:
            for hazard in hazards:
                if geometry_intersects(hazard.geometry, habitation.geometry):
                    matches[habitation.habitation_id].append(hazard)
        return matches

    def assess(self, hazards: Iterable[HazardFeature], habitations: Iterable[Habitation], *, now: datetime | None = None) -> list[HazardResult]:
        """Produce one result per habitation and hazard type, including no-alert rows."""
        hazards = tuple(hazards)
        habitations = tuple(habitations)
        now = now or self._now()
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        by_habitation = self.intersect_habitations(hazards, habitations)
        all_types = sorted({item.hazard_type for item in hazards})
        results: list[HazardResult] = []
        for habitation in habitations:
            matched = by_habitation.get(habitation.habitation_id, [])
            # Integration fix (AVASYA): emit one row for every hazard type that was
            # checked against this habitation — not only intersecting ones. A checked
            # type with no intersection is a real NO_ALERT with evidence, which the
            # original loop silently dropped; without this, "checked and clear" was
            # indistinguishable from "never assessed".
            types = sorted({item.hazard_type for item in matched} | set(all_types)) if all_types else ["unknown"]
            for hazard_type in types:
                items = [item for item in matched if item.hazard_type == hazard_type]
                dated = [item for item in items if item.observed_at is not None]
                # Integration fix (AVASYA): normalize naive observed_at to UTC so
                # mixed naive/aware timestamps cannot crash the temporal window
                # subtraction (offset-naive vs offset-aware TypeError).
                normalized = [
                    item if item.observed_at.tzinfo is not None
                    else type(item)(**{**item.__dict__, "observed_at": item.observed_at.replace(tzinfo=timezone.utc)})
                    for item in dated
                ]
                dated = normalized
                current = [item for item in dated if now - item.observed_at <= self.current_window and now - item.observed_at >= timedelta(0)]
                historical = [item for item in dated if item not in current]
                severities = [item.severity for item in current if item.severity is not None]
                max_severity = max(severities, default=None)
                alert = self.classify(len(items) > 0, bool(current), max_severity, bool(historical))
                source_ids = tuple(item.hazard_id for item in items)
                reasons = self._reasons(alert, bool(current), bool(historical), max_severity)
                if not items:
                    reasons = reasons + ("hazard type checked against habitation geometry; no intersection found",)
                confidence = self._confidence(items, current, max_severity)
                results.append(HazardResult(habitation.habitation_id, habitation.name, hazard_type, alert, bool(current), bool(historical), max_severity, len(historical), max((item.observed_at for item in dated), default=None), confidence, reasons, source_ids))
        return results

    def classify(self, has_intersection: bool, current_exposure: bool, severity: float | None, historical_exposure: bool) -> AlertLevel:
        if not has_intersection:
            return AlertLevel.NO_ALERT
        if current_exposure and severity is None:
            return AlertLevel.DATA_UNAVAILABLE
        if current_exposure and severity is not None:
            if severity >= self.red_threshold:
                return AlertLevel.RED
            if severity >= self.yellow_threshold:
                return AlertLevel.YELLOW
            return AlertLevel.NO_ALERT
        return AlertLevel.YELLOW if historical_exposure else AlertLevel.DATA_UNAVAILABLE

    @staticmethod
    def _reasons(alert: AlertLevel, current: bool, historical: bool, severity: float | None) -> tuple[str, ...]:
        reasons = [f"alert classified as {alert.value}"]
        if current:
            reasons.append("intersecting hazard observed in current window")
        if historical:
            reasons.append("historical intersecting hazard observed")
        if severity is not None:
            reasons.append(f"maximum current severity={severity:.3f}")
        if not current and not historical:
            reasons.append("no intersecting hazard observation")
        return tuple(reasons)

    @staticmethod
    def _confidence(items: list[HazardFeature], current: list[HazardFeature], severity: float | None) -> float:
        if not items:
            return 1.0
        score = 0.5 + (0.25 if current else 0) + (0.25 if severity is not None else 0)
        return round(min(score, 1.0), 3)
