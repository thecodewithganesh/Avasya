"""
The single entry point Mohith's backend actually calls.

Evidence in -> full decision out. This module owns NO scoring logic of its
own - every number comes from risk_engine.py, priority_engine.py,
capacity_engine.py, destination_scorer.py and recommendation_engine.py.
pipeline.py only sequences those calls and shapes the combined result.

No DB access, no FastAPI, no file I/O for the decision path itself (the
CLI block at the bottom reads JSON only so this file can be run standalone
for testing - backend/services/decision.py will call run_decision()
directly with objects it already has from the database).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from ai.capacity.capacity_engine import calculate_capacity
from ai.priority.priority_engine import calculate_priority
from ai.recommendation.recommendation_engine import (
    generate_recommendation,
    what_if_unavailable,
)
from ai.risk.risk_engine import calculate_risk
from ai.schemas.contracts import (
    CapacityResult,
    Destination,
    HabitationEvidence,
    PriorityResult,
    RecommendationResult,
    RiskResult,
)


@dataclass
class DecisionResult:
    """Everything produced for one habitation in one pipeline run: the full
    risk breakdown, the priority classification, the ranked destination
    recommendation, and (when a destination was recommended) that
    destination's full capacity waterfall for the officer-facing capacity
    screen. Nothing here is recomputed by the backend - it is stored and
    served as-is."""

    habitation_id: str
    risk: RiskResult
    priority: PriorityResult
    recommendation: RecommendationResult
    recommended_capacity: CapacityResult | None
    excluded_destination_ids: list[str] = field(default_factory=list)

    def to_contract_dict(self) -> dict:
        """The frozen P5 -> P3 JSON format from the build guide:
        habitation_id, risk_score, risk_level, priority, reasons,
        recommended_destination, capacity_sufficient. This is what
        Mohith's backend stores; everything richer (full breakdowns,
        ranked alternatives, ✓/✗ reasons) is still available on this
        DecisionResult for the fuller API responses / frontend screens."""
        return {
            "habitation_id": self.habitation_id,
            "risk_score": self.risk.risk_score,
            "risk_level": self.risk.risk_level,
            "priority": self.priority.priority,
            "reasons": self.priority.reasons,
            "recommended_destination": self.recommendation.recommended_destination_id,
            "capacity_sufficient": (
                self.recommended_capacity.capacity_sufficient
                if self.recommended_capacity is not None
                else False
            ),
        }


def _capacity_for_recommended(
    recommendation: RecommendationResult,
    destinations: list[Destination],
    population_requiring_relocation: float,
) -> CapacityResult | None:
    """Recompute the full CapacityResult (nominal -> usable breakdown) for
    whichever destination generate_recommendation() picked as the winner.
    generate_recommendation() already ran calculate_capacity() internally
    for every candidate, but only exposes capacity_sufficient (via
    SuitabilityResult) outward, not the full breakdown - so we call it once
    more, cheaply and deterministically, purely to surface that breakdown
    for the officer-facing capacity screen. Same inputs in, same result
    out - this is not a second source of truth."""
    if recommendation.recommended_destination_id is None:
        return None
    destination = next(
        (d for d in destinations if d.destination_id == recommendation.recommended_destination_id),
        None,
    )
    if destination is None:
        return None
    return calculate_capacity(destination, population_requiring_relocation)


def run_decision(
    evidence: HabitationEvidence,
    destinations: list[Destination],
    exclude: list[str] | None = None,
) -> DecisionResult:
    """Evidence in, full decision out. This is the one function the backend
    calls for a normal assessment. exclude lets the caller drop specific
    destination ids before scoring - it is what makes the what-if feature
    just a parameter, not a separate code path (see run_what_if below)."""

    risk = calculate_risk(evidence)
    priority = calculate_priority(evidence, risk)

    recommendation = generate_recommendation(
        evidence,
        destinations,
        priority.population_requiring_relocation,
        excluded_destination_ids=exclude,
    )

    recommended_capacity = _capacity_for_recommended(
        recommendation, destinations, priority.population_requiring_relocation
    )

    return DecisionResult(
        habitation_id=evidence.habitation_id,
        risk=risk,
        priority=priority,
        recommendation=recommendation,
        recommended_capacity=recommended_capacity,
        excluded_destination_ids=exclude or [],
    )


def run_what_if(
    evidence: HabitationEvidence,
    destinations: list[Destination],
    unavailable_destination_id: str,
    already_excluded: list[str] | None = None,
) -> DecisionResult:
    """The guide's WOW moment, as a pipeline call: 'what if
    <unavailable_destination_id> becomes unavailable?' Risk and priority
    don't change when a destination drops out, so they're recalculated
    from the same evidence for consistency, but the only thing that
    actually changes is the recommendation - recomputed live via
    what_if_unavailable(), not hardcoded or faked."""

    risk = calculate_risk(evidence)
    priority = calculate_priority(evidence, risk)

    recommendation = what_if_unavailable(
        evidence,
        destinations,
        priority.population_requiring_relocation,
        unavailable_destination_id,
        already_excluded=already_excluded,
    )

    recommended_capacity = _capacity_for_recommended(
        recommendation, destinations, priority.population_requiring_relocation
    )

    return DecisionResult(
        habitation_id=evidence.habitation_id,
        risk=risk,
        priority=priority,
        recommendation=recommendation,
        recommended_capacity=recommended_capacity,
        excluded_destination_ids=recommendation.excluded_destination_ids,
    )


# ---------------------------------------------------------------------------
# Standalone CLI: load Priya's habitation_evidence.json + destinations.json
# and print a decision for every habitation. Useful for demo rehearsal and
# for verifying the pipeline end-to-end without the backend/DB in the loop.
# The backend does NOT use this block - DecisionService will call
# run_decision()/run_what_if() directly with objects built from the DB.
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_evidence(path: Path) -> list[HabitationEvidence]:
    with path.open("r", encoding="utf-8") as f:
        records = json.load(f)
    return [HabitationEvidence.model_validate(r) for r in records]


def _load_destinations(path: Path) -> list[Destination]:
    with path.open("r", encoding="utf-8") as f:
        records = json.load(f)
    return [Destination.model_validate(r) for r in records]


def main() -> None:
    evidence_path = BASE_DIR / "data" / "habitation_evidence.json"
    destinations_path = BASE_DIR / "data" / "destinations.json"

    habitations = _load_evidence(evidence_path)
    destinations = _load_destinations(destinations_path)

    for evidence in habitations:
        decision = run_decision(evidence, destinations)
        print(json.dumps(decision.to_contract_dict(), indent=2))
        print(decision.recommendation.explanation)
        print("-" * 60)


if __name__ == "__main__":
    main()