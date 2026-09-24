from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import CapacityAssessment, Destination, Evidence, Habitation
from backend.models.enums import DataOrigin
from backend.services.geometry_utils import geom_lat_lon, haversine_km
from backend.transportation import (
    RoadSegment,
    TransportOptimizer,
    build_relocation_alert,
)
from backend.transportation.models import Destination as GraphDestination
from backend.transportation.models import Habitation as GraphHabitation


METHODOLOGY_ID = "AVASYA-TRANSPORT-OPERATIONAL-V2-GRAPH"

# AVASYA OPERATIONAL METHODOLOGY - haversine speed bands, clearly labelled.
# Not official government travel times. Used ONLY when a road segment has no
# measured travel time (direct-edge proxy); the optimizer records derived
# values as derived, never as measured data.
DEFAULT_SPEED_KMPH = 40.0


@dataclass
class RouteOption:
    destination_id: int
    destination_name: str
    distance_km: float
    travel_time_hours: float | None
    route_risk_score: float | None
    accessibility_score: float | None
    blocked_segments: list[str]
    hazard_exposure_along_route: str
    usable_capacity: int | None
    required_capacity: int | None
    capacity_sufficient: bool | None
    cost: float | None
    cost_breakdown: dict[str, Any]
    data_origin: str
    segment_ids: list[str] = field(default_factory=list)
    node_ids: list[str] = field(default_factory=list)
    data_sources: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "destination_id": self.destination_id,
            "destination_name": self.destination_name,
            "distance_km": self.distance_km,
            "travel_time_hours": self.travel_time_hours,
            "route_risk_score": self.route_risk_score,
            "accessibility_score": self.accessibility_score,
            "blocked_segments": self.blocked_segments,
            "hazard_exposure_along_route": self.hazard_exposure_along_route,
            "usable_capacity": self.usable_capacity,
            "required_capacity": self.required_capacity,
            "capacity_sufficient": self.capacity_sufficient,
            "cost": self.cost,
            "cost_breakdown": self.cost_breakdown,
            "segment_ids": self.segment_ids,
            "node_ids": self.node_ids,
            "data_sources": self.data_sources,
            "data_origin": self.data_origin,
            "limitations": self.limitations,
        }


@dataclass
class TransportResult:
    habitation_id: int
    recommended_destination_id: int | None
    recommended_route: RouteOption | None
    alternatives: list[RouteOption]
    methodology: str
    limitations: list[str]
    data_origin: str
    methodology_note: str | None = None
    optimizer_status: str = "RECOMMENDED"
    optimizer_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "habitation_id": self.habitation_id,
            "recommended_destination_id": self.recommended_destination_id,
            "recommended_route": self.recommended_route.to_dict() if self.recommended_route else None,
            "alternatives": [option.to_dict() for option in self.alternatives],
            "methodology": self.methodology,
            "methodology_note": self.methodology_note,
            "optimizer_status": self.optimizer_status,
            "optimizer_reason": self.optimizer_reason,
            "limitations": self.limitations,
            "data_origin": self.data_origin,
        }


def _accessibility_from_risk(risk_score: float | None) -> str:
    """Map a destination risk score to the teammate's accessibility vocabulary.

    AVASYA OPERATIONAL METHODOLOGY: destination risk > 70 -> LIMITED. Missing
    risk stays UNKNOWN - never silently OPEN.
    """
    if risk_score is None:
        return "UNKNOWN"
    if risk_score > 70:
        return "LIMITED"
    return "OPEN"


class TransportService:
    """Capacity-gated, hazard-aware route planning via the graph optimizer.

    This service adapts AVASYA's persisted state (habitations, destinations,
    capacity assessments, road_closure evidence) into the teammate-owned
    transportation module's graph and delegates all route search, ranking,
    and missing-data handling to `TransportOptimizer`. The capacity gate and
    blocked-road exclusion remain hard constraints inside the optimizer.
    """

    def __init__(self, session: Session):
        self.session = session

    def _blocked_segments(self) -> list[dict[str, Any]]:
        """Authoritative/current blocked-road evidence only. Empty list means
        no blocked-road evidence exists - it does NOT mean roads are clear."""
        rows = list(self.session.scalars(
            select(Evidence).where(
                Evidence.habitation_id.is_(None),
                Evidence.evidence_type == "road_closure",
            )
        ).all())
        blocked: list[dict[str, Any]] = []
        for row in rows:
            payload = row.evidence_payload or {}
            blocked.append({
                "segment": str(payload.get("segment", row.source_name)),
                "destination_id": str(payload.get("destination_id", "")),
                "source": row.source_name,
            })
        return blocked

    def _graph_segments(
        self,
        habitation: Habitation,
        destinations: list[tuple[Destination, CapacityAssessment]],
        blocked: list[dict[str, Any]],
    ) -> tuple[list[RoadSegment], list[str]]:
        """Build the road graph as one directed edge per (habitation,
        destination) pair. Distance is a great-circle proxy because the demo
        has no imported road-network geometry; documented as a limitation.
        Travel time uses the operational speed band only as a derived proxy,
        and the optimizer still records it as derived (not measured) data.
        """
        segments: list[RoadSegment] = []
        limitations: list[str] = [
            "Distance is a great-circle proxy; actual road-network geometry is not loaded for the demo.",
            "Travel time uses AVASYA OPERATIONAL METHODOLOGY speed bands, not measured road speeds.",
            "Blocked-road handling activates only when authoritative road_closure evidence exists.",
        ]
        for destination, _capacity in destinations:
            blocked_here = [
                item for item in blocked
                if not item["destination_id"] or item["destination_id"] == str(destination.id)
            ]
            try:
                dest_lat, dest_lon = geom_lat_lon(destination.geom)
            except ValueError as exc:
                limitations.append(
                    f"Destination {destination.name} excluded: geometry unreadable ({exc})."
                )
                continue
            distance = haversine_km(habitation.latitude, habitation.longitude, dest_lat, dest_lon)
            is_blocked = bool(blocked_here)
            segment = RoadSegment(
                id=f"R-{habitation.id}-{destination.id}",
                from_node=f"habitation-{habitation.id}",
                to_node=f"destination-{destination.id}",
                distance_km=distance,
                travel_time_minutes=round(distance / DEFAULT_SPEED_KMPH * 60.0, 2),
                accessibility=(
                    "BLOCKED" if is_blocked
                    else _accessibility_from_risk(destination.risk_score)
                ),
                blocked=is_blocked if is_blocked else False,
                hazard_exposure=(
                    round(min(1.0, float(destination.risk_score) / 100.0), 4)
                    if destination.risk_score is not None
                    else None
                ),
                hazard_types=(),
                source=(
                    blocked_here[0]["source"] if is_blocked and blocked_here[0].get("source")
                    else f"destination-record-{destination.id}"
                ),
            )
            segments.append(segment)
            if is_blocked:
                limitations.append(
                    f"Route to {destination.name} has blocked segments: "
                    f"{', '.join(item['segment'] for item in blocked_here)}"
                )
        return segments, limitations

    def plan(self, habitation_id: int, required_capacity: int) -> TransportResult:
        """Plan relocation transport through the teammate's graph optimizer.

        The capacity gate and blocked-road exclusion are hard constraints
        inside the optimizer; ranking uses weighted travel time, distance,
        hazard exposure, accessibility, and capacity resilience."""
        habitation = self.session.get(Habitation, habitation_id)
        if habitation is None:
            raise ValueError("Habitation not found")
        if habitation.latitude is None or habitation.longitude is None:
            raise ValueError("Habitation has no coordinates; route planning is DATA_UNAVAILABLE")

        rows = self.session.execute(
            select(Destination, CapacityAssessment)
            .join(CapacityAssessment, CapacityAssessment.destination_id == Destination.id)
            .where(CapacityAssessment.habitation_id == habitation_id)
        ).all()

        blocked = self._blocked_segments()
        graph_segments, limitations = self._graph_segments(habitation, rows, blocked)

        graph_habitation = GraphHabitation(
            id=str(habitation.id),
            name=habitation.name,
            road_node=f"habitation-{habitation.id}",
            population=required_capacity,
            source=f"habitation-record-{habitation.id}",
        )
        graph_destinations = [
            GraphDestination(
                id=str(destination.id),
                name=destination.name,
                road_node=f"destination-{destination.id}",
                capacity_total=capacity.nominal_capacity or 0,
                # available = capacity_total - occupied must equal the PERSISTED
                # usable_capacity (nominal - occupancy - constraints) so that
                # any downstream gate result, including forced test states,
                # is exactly what the optimizer enforces.
                occupied=max(0, (capacity.nominal_capacity or 0) - (capacity.usable_capacity or 0)),
                accepts_relocation=True,
                accessibility=_accessibility_from_risk(destination.risk_score),
                source=f"destination-record-{destination.id}",
            )
            for destination, capacity in rows
        ]

        optimizer = TransportOptimizer(graph_segments)
        result = optimizer.optimize(graph_habitation, graph_destinations, evacuees=required_capacity)
        payload = result.to_dict()

        def _option(candidate: dict[str, Any]) -> RouteOption:
            destination_entry = candidate["destination"]
            route_entry = candidate["route"]
            destination = next(
                (d for d, _ in rows if str(d.id) == str(destination_entry["id"])), None
            )
            travel_minutes = candidate["travel_time_minutes"]
            route_risk = candidate["route_risk"]
            accessibility = candidate["accessibility"]
            blocked_here = [
                item["segment"] for item in blocked
                if accessibility == "BLOCKED"
                and (not item["destination_id"] or item["destination_id"] == str(destination_entry["id"]))
            ]
            return RouteOption(
                destination_id=int(destination_entry["id"]),
                destination_name=destination_entry["name"],
                distance_km=candidate["distance_km"],
                travel_time_hours=(
                    round(float(travel_minutes) / 60.0, 3)
                    if isinstance(travel_minutes, (int, float)) else None
                ),
                route_risk_score=(
                    round(float(route_risk) * 100.0, 2)
                    if isinstance(route_risk, (int, float)) else None
                ),
                accessibility_score={"OPEN": 100.0, "LIMITED": 50.0, "UNKNOWN": None, "BLOCKED": 0.0}.get(accessibility),
                blocked_segments=blocked_here,
                hazard_exposure_along_route=(
                    "SUPPLIED" if isinstance(route_risk, (int, float)) else "NO_EVIDENCE"
                ),
                usable_capacity=destination_entry["available_capacity"],
                required_capacity=destination_entry["capacity_required"],
                capacity_sufficient=(
                    destination_entry["available_capacity"] >= destination_entry["capacity_required"]
                ),
                cost=candidate["optimization_score"],
                cost_breakdown={
                    "optimization_score": candidate["optimization_score"],
                    "travel_time_minutes": travel_minutes,
                    "distance_km": candidate["distance_km"],
                    "route_risk": route_risk,
                    "accessibility": accessibility,
                },
                segment_ids=list(route_entry["segment_ids"]),
                node_ids=list(route_entry["node_ids"]),
                data_sources=list(candidate["data_sources"]),
                data_origin=destination.data_origin.value if destination else DataOrigin.MIXED.value,
            )

        recommended_candidate = None
        if payload.get("recommended_destination") and payload.get("recommended_route"):
            recommended_candidate = {
                "destination": payload["recommended_destination"],
                "route": payload["recommended_route"],
                "distance_km": payload["distance_km"],
                "travel_time_minutes": payload["travel_time_minutes"],
                "route_risk": payload["route_risk"],
                "accessibility": payload["accessibility"],
                "optimization_score": (
                    payload["recommended_route"].get("optimization_score", 0.0) or 0.0
                ),
                "data_sources": payload["recommended_route"].get("data_sources", []),
            }
        recommended_option = _option(recommended_candidate) if recommended_candidate else None
        alternative_options = [_option(candidate) for candidate in payload.get("alternative_routes", [])]

        if not recommended_option:
            limitations.append(
                f"NO_FEASIBLE_ROUTE: {payload.get('reason') or 'no capacity-feasible, unblocked path exists.'}"
            )

        data_origin = DataOrigin.MIXED.value
        if rows:
            origins = {destination.data_origin for destination, _ in rows}
            if len(origins) == 1:
                data_origin = next(iter(origins)).value

        return TransportResult(
            habitation_id=habitation_id,
            recommended_destination_id=(
                int(payload["recommended_destination"]["id"]) if recommended_option else None
            ),
            recommended_route=recommended_option,
            alternatives=alternative_options,
            methodology=METHODOLOGY_ID,
            methodology_note=(
                "Route search, ranking, capacity gating, and blocked-road exclusion are "
                "performed by the AVASYA transportation module (TransportOptimizer); "
                "weights: travel 0.30, distance 0.20, hazard 0.30, accessibility 0.10, "
                "capacity resilience 0.10, missing-data penalty 0.05."
            ),
            optimizer_status=payload["status"],
            optimizer_reason=payload.get("reason"),
            limitations=limitations,
            data_origin=data_origin,
        )

    def relocation_alert(
        self,
        habitation_id: int,
        required_capacity: int,
        *,
        hazard: str,
        severity: str,
        reason: str,
        response_window: str,
        source: str,
    ) -> dict[str, Any]:
        """Build an AVASYA Decision-Support Alert via the teammate's builder
        after a transport plan resolves a destination."""
        plan = self.plan(habitation_id, required_capacity)
        destination_name = None
        if plan.recommended_route:
            destination_name = plan.recommended_route.destination_name
        alert = build_relocation_alert(
            alert_id=f"AVASYA-{habitation.id}-{hazard.upper()[:12]}",
            hazard=hazard,
            severity=severity if severity in {"LOW", "MODERATE", "HIGH", "CRITICAL"} else "MODERATE",
            habitation_name=habitation.name,
            reason=reason,
            response_window=response_window,
            source=source,
            destination_name=destination_name,
            official_source=False,
        )
        return {
            "alert": alert.to_dict(),
            "transport": plan.to_dict(),
        }
