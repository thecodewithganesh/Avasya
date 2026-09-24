"""Hazard-aware transportation optimization for Freebuff.

The optimizer ranks feasible routes using multiple factors. It never fabricates
travel time, risk, blockage, or accessibility values when source data is absent.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite
from typing import Iterable, Optional

from .models import (
    Accessibility,
    Destination,
    Habitation,
    OptimizationResult,
    RoadSegment,
    RouteCandidate,
)


@dataclass(frozen=True)
class OptimizationWeights:
    """Relative weights for the decision-support ranking (lower score is better)."""

    travel_time: float = 0.30
    distance: float = 0.20
    hazard_risk: float = 0.30
    accessibility: float = 0.10
    capacity_resilience: float = 0.10
    missing_data_penalty: float = 0.05


@dataclass(frozen=True)
class _Path:
    destination: Destination
    segments: tuple[RoadSegment, ...]
    nodes: tuple[str, ...]


_ACCESSIBILITY_RANK: dict[Accessibility, int] = {
    "OPEN": 0,
    "LIMITED": 1,
    "UNKNOWN": 2,
    "BLOCKED": 3,
}
_ACCESSIBILITY_PENALTY: dict[Accessibility, float] = {
    "OPEN": 0.0,
    "LIMITED": 0.5,
    "UNKNOWN": 0.75,
    "BLOCKED": 1.0,
}


class TransportOptimizer:
    """Find routes from a habitation to capacity-feasible destinations.

    Roads are directed. A blocked road is excluded when the input explicitly
    says ``blocked=true`` or ``accessibility=BLOCKED``. Unknown status is kept as
    unknown and is not silently converted to open.
    """

    def __init__(
        self,
        segments: Iterable[RoadSegment],
        *,
        weights: OptimizationWeights | None = None,
        allow_limited_access: bool = True,
        max_candidates_per_destination: int = 20,
        max_hops: int | None = None,
    ) -> None:
        self.segments = tuple(segments)
        self.weights = weights or OptimizationWeights()
        self.allow_limited_access = allow_limited_access
        self.max_candidates_per_destination = max(1, max_candidates_per_destination)
        self.max_hops = max_hops
        self._adjacency: dict[str, tuple[RoadSegment, ...]] = {}
        for segment in self.segments:
            self._adjacency.setdefault(segment.from_node, tuple())
            self._adjacency[segment.from_node] += (segment,)

    def optimize(
        self,
        habitation: Habitation,
        destinations: Iterable[Destination],
        *,
        evacuees: int | None = None,
        alternative_limit: int = 3,
    ) -> OptimizationResult:
        """Return the best feasible destination and route for one habitation.

        ``evacuees`` defaults to the habitation population. Capacity is a hard
        constraint, not merely a ranking preference. A route may still be
        recommended when time or risk is unavailable, but the corresponding
        output field is ``DATA_UNAVAILABLE``.
        """

        required = max(0, habitation.population if evacuees is None else evacuees)
        destinations_tuple = tuple(destinations)
        paths: list[_Path] = []
        capacity_blocked = 0
        for destination in destinations_tuple:
            if (
                not destination.accepts_relocation
                or destination.available_capacity < required
                or destination.accessibility == "BLOCKED"
            ):
                capacity_blocked += 1
                continue
            if not self.allow_limited_access and destination.accessibility == "LIMITED":
                continue
            paths.extend(self._find_paths(habitation.road_node, destination))

        candidates = [self._candidate_from_path(path, required) for path in paths]
        if not candidates:
            if capacity_blocked == len(destinations_tuple) and destinations_tuple:
                reason = "No destination has sufficient available capacity or accepts relocation."
            else:
                reason = "No feasible route exists after excluding blocked roads and inaccessible paths."
            return OptimizationResult(
                habitation_id=habitation.id,
                habitation_name=habitation.name,
                required_capacity=required,
                recommended=None,
                status="NO_FEASIBLE_ROUTE",
                reason=reason,
            )

        ranked = self._rank(candidates)
        recommended = ranked[0]
        alternatives = tuple(ranked[1 : 1 + max(0, alternative_limit)])
        return OptimizationResult(
            habitation_id=habitation.id,
            habitation_name=habitation.name,
            required_capacity=required,
            recommended=recommended,
            alternatives=alternatives,
            status="RECOMMENDED",
            reason=(
                "Selected using travel time, distance, hazard exposure, road accessibility, "
                "and destination capacity; this is not a shortest-distance-only result."
            ),
        )

    def _find_paths(self, start: str, destination: Destination) -> list[_Path]:
        paths: list[_Path] = []
        max_hops = self.max_hops or max(1, len(self.segments))

        def visit(node: str, used_nodes: set[str], segments: tuple[RoadSegment, ...]) -> None:
            if len(paths) >= self.max_candidates_per_destination:
                return
            if len(segments) > max_hops:
                return
            if node == destination.road_node:
                paths.append(_Path(destination, segments, (start,) + tuple(s.to_node for s in segments)))
                return
            for segment in self._adjacency.get(node, ()):
                if segment.to_node in used_nodes:
                    continue
                if segment.is_blocked:
                    continue
                if not self.allow_limited_access and segment.accessibility == "LIMITED":
                    continue
                visit(
                    segment.to_node,
                    used_nodes | {segment.to_node},
                    segments + (segment,),
                )

        visit(start, {start}, tuple())
        return paths

    @staticmethod
    def _route_accessibility(
        segments: tuple[RoadSegment, ...],
        destination_accessibility: Accessibility,
    ) -> Accessibility:
        statuses = [segment.accessibility for segment in segments]
        statuses.append(destination_accessibility)
        return max(
            statuses,
            key=lambda status: _ACCESSIBILITY_RANK[status],
        )

    @staticmethod
    def _route_risk(segments: tuple[RoadSegment, ...]) -> Optional[float]:
        if not segments or any(segment.hazard_exposure is None for segment in segments):
            return None
        total_distance = sum(max(0.0, segment.distance_km) for segment in segments)
        weighted_mean = (
            sum(float(segment.hazard_exposure) * max(0.0, segment.distance_km) for segment in segments)
            / total_distance
            if total_distance
            else sum(float(segment.hazard_exposure) for segment in segments) / len(segments)
        )
        peak = max(float(segment.hazard_exposure) for segment in segments)
        return min(1.0, max(0.0, 0.6 * weighted_mean + 0.4 * peak))

    @staticmethod
    def _data_sources(path: _Path) -> tuple[str, ...]:
        sources = {source for segment in path.segments if (source := segment.source)}
        if path.destination.source:
            sources.add(path.destination.source)
        return tuple(sorted(sources))

    def _candidate_from_path(self, path: _Path, required: int) -> RouteCandidate:
        distance = sum(max(0.0, segment.distance_km) for segment in path.segments)
        travel_times = [segment.travel_time_minutes for segment in path.segments]
        travel_time = (
            sum(float(value) for value in travel_times)
            if all(value is not None and isfinite(float(value)) and float(value) >= 0 for value in travel_times)
            else None
        )
        return RouteCandidate(
            destination_id=path.destination.id,
            destination_name=path.destination.name,
            segment_ids=tuple(segment.id for segment in path.segments),
            node_ids=path.nodes,
            distance_km=distance,
            travel_time_minutes=travel_time,
            route_risk=self._route_risk(path.segments),
            accessibility=self._route_accessibility(
                path.segments, path.destination.accessibility
            ),
            available_capacity=path.destination.available_capacity,
            capacity_required=required,
            score=0.0,
            data_sources=self._data_sources(path),
        )

    def _rank(self, candidates: list[RouteCandidate]) -> list[RouteCandidate]:
        distances = [candidate.distance_km for candidate in candidates]
        known_times = [candidate.travel_time_minutes for candidate in candidates if candidate.travel_time_minutes is not None]
        known_risks = [candidate.route_risk for candidate in candidates if candidate.route_risk is not None]

        def normalize(value: float, values: list[float]) -> float:
            if not values or max(values) == min(values):
                return 0.0
            return (value - min(values)) / (max(values) - min(values))

        ranked: list[RouteCandidate] = []
        for candidate in candidates:
            metrics: list[tuple[float, float]] = []
            if candidate.travel_time_minutes is not None and known_times:
                metrics.append((self.weights.travel_time, normalize(candidate.travel_time_minutes, [float(v) for v in known_times])))
            if distances:
                metrics.append((self.weights.distance, normalize(candidate.distance_km, distances)))
            if candidate.route_risk is not None and known_risks:
                metrics.append((self.weights.hazard_risk, normalize(candidate.route_risk, [float(v) for v in known_risks])))
            metrics.append((self.weights.accessibility, _ACCESSIBILITY_PENALTY[candidate.accessibility]))
            required = max(1, candidate.capacity_required)
            capacity_buffer = max(0.0, candidate.available_capacity - candidate.capacity_required) / required
            capacity_penalty = 1.0 - min(1.0, capacity_buffer)
            metrics.append((self.weights.capacity_resilience, capacity_penalty))
            weight_sum = sum(weight for weight, _ in metrics) or 1.0
            score = sum(weight * value for weight, value in metrics) / weight_sum
            missing_count = int(candidate.travel_time_minutes is None) + int(candidate.route_risk is None)
            score += self.weights.missing_data_penalty * missing_count
            ranked.append(
                RouteCandidate(
                    destination_id=candidate.destination_id,
                    destination_name=candidate.destination_name,
                    segment_ids=candidate.segment_ids,
                    node_ids=candidate.node_ids,
                    distance_km=candidate.distance_km,
                    travel_time_minutes=candidate.travel_time_minutes,
                    route_risk=candidate.route_risk,
                    accessibility=candidate.accessibility,
                    available_capacity=candidate.available_capacity,
                    capacity_required=candidate.capacity_required,
                    score=score,
                    data_sources=candidate.data_sources,
                )
            )
        return sorted(ranked, key=lambda candidate: (candidate.score, candidate.distance_km, candidate.segment_ids))
