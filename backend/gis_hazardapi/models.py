"""Domain models for hazard ingestion and assessment."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Mapping, Sequence

Coordinate = tuple[float, float]
Polygon = tuple[Coordinate, ...]


class AlertLevel(str, Enum):
    RED = "RED"
    YELLOW = "YELLOW"
    NO_ALERT = "NO_ALERT"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


@dataclass(frozen=True)
class HazardFeature:
    """A processed hazard observation represented by a polygon or point."""

    hazard_id: str
    hazard_type: str
    geometry: Polygon
    observed_at: datetime | None = None
    severity: float | None = None  # Normalized 0..1 when supplied by the source.
    source: str | None = None
    properties: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Habitation:
    """A habitation boundary/point used for exposure intersection."""

    habitation_id: str
    name: str
    geometry: Polygon
    population: int | None = None
    properties: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class HazardResult:
    """Assessment for one habitation and hazard type."""

    habitation_id: str
    habitation_name: str
    hazard_type: str
    alert: AlertLevel
    current_exposure: bool
    historical_exposure: bool
    current_severity: float | None
    historical_count: int
    latest_observed_at: datetime | None
    confidence: float
    reasons: Sequence[str]
    source_ids: Sequence[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "habitation_id": self.habitation_id,
            "habitation_name": self.habitation_name,
            "hazard_type": self.hazard_type,
            "alert": self.alert.value,
            "current_exposure": self.current_exposure,
            "historical_exposure": self.historical_exposure,
            "current_severity": self.current_severity,
            "historical_count": self.historical_count,
            "latest_observed_at": self.latest_observed_at.isoformat() if self.latest_observed_at else None,
            "confidence": self.confidence,
            "reasons": list(self.reasons),
            "source_ids": list(self.source_ids),
        }
