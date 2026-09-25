"""Data contracts for Freebuff transportation optimization and AVASYA alerts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

DATA_UNAVAILABLE = "DATA_UNAVAILABLE"
Accessibility = Literal["OPEN", "LIMITED", "BLOCKED", "UNKNOWN"]


@dataclass(frozen=True)
class Habitation:
    """A vulnerable habitation that may need relocation or evacuation support."""

    id: str
    name: str
    road_node: str
    population: int
    vulnerable_population: int = 0
    source: Optional[str] = None


@dataclass(frozen=True)
class Destination:
    """A receiving location with a finite carrying capacity."""

    id: str
    name: str
    road_node: str
    capacity_total: int
    occupied: int = 0
    accepts_relocation: bool = True
    accessibility: Accessibility = "UNKNOWN"
    source: Optional[str] = None

    @property
    def available_capacity(self) -> int:
        return max(0, self.capacity_total - self.occupied)


@dataclass(frozen=True)
class RoadSegment:
    """A directed road edge. Missing values remain missing; they are never inferred."""

    id: str
    from_node: str
    to_node: str
    distance_km: float
    travel_time_minutes: Optional[float] = None
    accessibility: Accessibility = "UNKNOWN"
    blocked: Optional[bool] = None
    hazard_exposure: Optional[float] = None
    hazard_types: tuple[str, ...] = field(default_factory=tuple)
    source: Optional[str] = None

    @property
    def is_blocked(self) -> bool:
        """Return true only when a source explicitly blocks the road."""

        return self.blocked is True or self.accessibility == "BLOCKED"


@dataclass(frozen=True)
class RouteCandidate:
    """A feasible route candidate or a route selected for recommendation."""

    destination_id: str
    destination_name: str
    segment_ids: tuple[str, ...]
    node_ids: tuple[str, ...]
    distance_km: float
    travel_time_minutes: Optional[float]
    route_risk: Optional[float]
    accessibility: Accessibility
    available_capacity: int
    capacity_required: int
    score: float
    data_sources: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        return {
            "destination": {
                "id": self.destination_id,
                "name": self.destination_name,
                "available_capacity": self.available_capacity,
                "capacity_required": self.capacity_required,
            },
            "route": {
                "segment_ids": list(self.segment_ids),
                "node_ids": list(self.node_ids),
            },
            "distance_km": round(self.distance_km, 3),
            "travel_time_minutes": (
                round(self.travel_time_minutes, 2)
                if self.travel_time_minutes is not None
                else DATA_UNAVAILABLE
            ),
            "route_risk": (
                round(self.route_risk, 4)
                if self.route_risk is not None
                else DATA_UNAVAILABLE
            ),
            "accessibility": self.accessibility,
            "optimization_score": round(self.score, 6),
            "data_sources": list(self.data_sources),
        }


@dataclass(frozen=True)
class OptimizationResult:
    """The complete public response for a habitation-to-destination decision."""

    habitation_id: str
    habitation_name: str
    required_capacity: int
    recommended: Optional[RouteCandidate]
    alternatives: tuple[RouteCandidate, ...] = field(default_factory=tuple)
    status: Literal["RECOMMENDED", "NO_FEASIBLE_ROUTE"] = "NO_FEASIBLE_ROUTE"
    reason: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "habitation": {
                "id": self.habitation_id,
                "name": self.habitation_name,
            },
            "required_capacity": self.required_capacity,
            "recommended_destination": (
                self.recommended.to_dict()["destination"]
                if self.recommended
                else None
            ),
            "recommended_route": (
                self.recommended.to_dict()["route"] if self.recommended else None
            ),
            "distance_km": (
                round(self.recommended.distance_km, 3)
                if self.recommended
                else DATA_UNAVAILABLE
            ),
            "travel_time_minutes": (
                round(self.recommended.travel_time_minutes, 2)
                if self.recommended and self.recommended.travel_time_minutes is not None
                else DATA_UNAVAILABLE
            ),
            "route_risk": (
                round(self.recommended.route_risk, 4)
                if self.recommended and self.recommended.route_risk is not None
                else DATA_UNAVAILABLE
            ),
            "accessibility": (
                self.recommended.accessibility if self.recommended else DATA_UNAVAILABLE
            ),
            "alternative_routes": [candidate.to_dict() for candidate in self.alternatives],
            "reason": self.reason,
        }


@dataclass(frozen=True)
class DecisionSupportAlert:
    """An AVASYA Decision-Support Alert, not an official government alert."""

    alert_id: str
    hazard: str
    severity: Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]
    affected_habitation: str
    reason: str
    recommended_action: str
    response_window: str
    source: str
    official: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "alert_type": "AVASYA Decision-Support Alert",
            "official": self.official,
            "alert_id": self.alert_id,
            "hazard": self.hazard,
            "severity": self.severity,
            "affected_habitation": self.affected_habitation,
            "reason": self.reason,
            "recommended_action": self.recommended_action,
            "response_window": self.response_window,
            "source": self.source,
        }
