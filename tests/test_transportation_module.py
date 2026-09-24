"""Regression tests for Freebuff transportation decision support."""

from __future__ import annotations

import unittest

from backend.transportation import (
    DATA_UNAVAILABLE,
    Destination,
    Habitation,
    OptimizationWeights,
    RoadSegment,
    TransportOptimizer,
    build_relocation_alert,
)


class TransportationTests(unittest.TestCase):
    def test_hazard_and_capacity_can_beat_shortest_distance(self) -> None:
        habitation = Habitation("H", "H", "h", 100)
        destinations = [
            Destination("near", "Near", "near", 100, 0, source="capacity"),
            Destination("safe", "Safe", "safe", 300, 0, source="capacity"),
        ]
        segments = [
            RoadSegment("near-road", "h", "near", 2, 10, "OPEN", False, 0.95),
            RoadSegment("safe-road", "h", "safe", 5, 13, "OPEN", False, 0.05),
        ]
        result = TransportOptimizer(
            segments,
            weights=OptimizationWeights(
                travel_time=0.20,
                distance=0.10,
                hazard_risk=0.50,
                accessibility=0.05,
                capacity_resilience=0.15,
            ),
        ).optimize(habitation, destinations)
        self.assertEqual(result.status, "RECOMMENDED")
        self.assertEqual(result.recommended.destination_id, "safe")
        self.assertEqual(result.recommended.distance_km, 5)

    def test_explicitly_blocked_roads_are_excluded(self) -> None:
        habitation = Habitation("H", "H", "h", 10)
        destination = Destination("D", "D", "d", 10)
        segments = [RoadSegment("blocked", "h", "d", 1, 2, "OPEN", True, 0.0)]
        result = TransportOptimizer(segments).optimize(habitation, [destination])
        self.assertEqual(result.status, "NO_FEASIBLE_ROUTE")

    def test_unknown_travel_time_and_risk_are_not_invented(self) -> None:
        habitation = Habitation("H", "H", "h", 10)
        destination = Destination("D", "D", "d", 10)
        segments = [RoadSegment("unknown", "h", "d", 7, None, "UNKNOWN", None, None)]
        result = TransportOptimizer(segments).optimize(habitation, [destination])
        payload = result.to_dict()
        self.assertEqual(payload["status"], "RECOMMENDED")
        self.assertEqual(payload["travel_time_minutes"], DATA_UNAVAILABLE)
        self.assertEqual(payload["route_risk"], DATA_UNAVAILABLE)
        self.assertEqual(payload["accessibility"], "UNKNOWN")

    def test_capacity_is_a_hard_feasibility_constraint(self) -> None:
        habitation = Habitation("H", "H", "h", 11)
        destination = Destination("D", "D", "d", 10)
        segments = [RoadSegment("road", "h", "d", 1, 2, "OPEN", False, 0.1)]
        result = TransportOptimizer(segments).optimize(habitation, [destination])
        self.assertEqual(result.status, "NO_FEASIBLE_ROUTE")
        self.assertIn("capacity", result.reason.lower())

    def test_avasya_alert_contains_all_required_chain_fields(self) -> None:
        alert = build_relocation_alert(
            alert_id="A-1",
            hazard="Landslide",
            severity="HIGH",
            habitation_name="Hill Hamlet",
            reason="Road-side slope movement intersects the access corridor.",
            response_window="Within 1 hour",
            source="Slope survey 2026-09-16",
        ).to_dict()
        self.assertEqual(alert["alert_type"], "AVASYA Decision-Support Alert")
        for key in (
            "hazard",
            "severity",
            "affected_habitation",
            "reason",
            "recommended_action",
            "response_window",
            "source",
        ):
            self.assertTrue(alert[key])
        self.assertFalse(alert["official"])


if __name__ == "__main__":
    unittest.main()
