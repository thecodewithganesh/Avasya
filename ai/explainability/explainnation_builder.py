"""
The piece that actually answers the officer's question: "so which
destination do I send them to, and why?"

Combines capacity_engine.py + destination_scorer.py results across ALL
candidate destinations for one habitation, ranks them, and picks a winner -
but NEVER picks a destination whose capacity is insufficient, even if it
somehow scored higher on other factors. Capacity sufficiency is a hard gate,
not just one more weighted factor - per the guide, this is the whole point
of AVASYA ("not merely finding a green location").

Also implements the guide's specific "wow moment": what_if_unavailable(),
which recalculates the recommendation with one destination excluded, so a
judge can ask "what if D04 is suddenly unavailable?" and watch the system
respond live instead of you re-running anything manually.
"""

from __future__ import annotations

from datetime import datetime, timezone

from ai.capacity.capacity_engine import calculate_capacity
from ai.schemas.contracts import (
    Destination,
    HabitationEvidence,
    RecommendationResult,
    SuitabilityResult,
)
from ai.suitability.destination_scorer import score_destination


def _build_reasons_checklist(result: SuitabilityResult) -> list[str]:
    """Turns a SuitabilityResult into the guide's exact checkmark checklist
    format, describing this ONE destination in isolation. Used for the
    winning destination's "why it was recommended" screen."""
    checklist = []
    checklist.append(
        ("\u2713" if result.capacity_sufficient else "\u2717")
        + f" {'Adequate' if result.capacity_sufficient else 'Insufficient'} usable capacity"
    )
    b = result.suitability_breakdown
    checklist.append(("\u2713" if b.water_contribution > 0 else "\u2717") + " Water available")
    checklist.append(("\u2713" if b.sanitation_contribution > 0 else "\u2717") + " Sanitation confirmed")
    checklist.append(
        ("\u2713" if b.healthcare_access_contribution >= 5 else "\u2717") + " Reasonable healthcare access"
    )
    checklist.append(
        ("\u2713" if b.road_access_contribution >= 7.5 else "\u2717") + " Good road accessibility"
    )
    checklist.append(
        ("\u2713" if b.distance_contribution >= 5 else "\u2717") + f" Reasonable distance ({result.distance_km:.1f} km)"
    )
    return checklist


def _build_rejection_reasons(
    winner: SuitabilityResult, candidate: SuitabilityResult
) -> list[str]:
    """Explains why `candidate` was NOT recommended, specifically relative
    to `winner`.

    This is deliberately different from _build_reasons_checklist(), which
    only describes a destination in isolation and is fine for the winner
    ("here's why this one is good") but wrong for a runner-up: a runner-up
    can pass every individual check and still lose purely on overall score,
    so re-running the same isolated checklist on it produced a list of
    checkmarks even though it was "rejected" - confusing on a "why NOT this
    one" screen. This function always gives at least one genuinely
    comparative reason.
    """

    if not candidate.capacity_sufficient:
        # Capacity is the hard gate - if it failed on that, that IS the
        # reason, and the isolated checklist already states it correctly
        # (it will show an Insufficient usable capacity cross-mark).
        return _build_reasons_checklist(candidate)

    reasons: list[str] = [
        f"\u2717 Lower suitability score than {winner.destination_id} "
        f"({candidate.suitability_score:.1f} vs {winner.suitability_score:.1f})"
    ]

    if candidate.distance_km > winner.distance_km:
        reasons.append(
            f"\u2717 Farther from the habitation than {winner.destination_id} "
            f"({candidate.distance_km:.1f} km vs {winner.distance_km:.1f} km)"
        )

    cb, wb = candidate.suitability_breakdown, winner.suitability_breakdown
    if cb.water_contribution < wb.water_contribution:
        reasons.append(f"\u2717 Weaker water access than {winner.destination_id}")
    if cb.sanitation_contribution < wb.sanitation_contribution:
        reasons.append(f"\u2717 Weaker sanitation than {winner.destination_id}")
    if cb.healthcare_access_contribution < wb.healthcare_access_contribution:
        reasons.append(f"\u2717 Worse healthcare access than {winner.destination_id}")
    if cb.road_access_contribution < wb.road_access_contribution:
        reasons.append(f"\u2717 Worse road access than {winner.destination_id}")

    return reasons


def generate_recommendation(
    habitation: HabitationEvidence,
    destinations: list[Destination],
    population_requiring_relocation: float,
    excluded_destination_ids: list[str] | None = None,
) -> RecommendationResult:
    """Score every available destination for this habitation, rank them,
    and produce the final explainable recommendation. Destinations listed
    in excluded_destination_ids are skipped entirely - this is what powers
    the what-if feature (see what_if_unavailable below)."""

    excluded_destination_ids = excluded_destination_ids or []
    candidates = [d for d in destinations if d.destination_id not in excluded_destination_ids]

    ranked: list[SuitabilityResult] = []
    for destination in candidates:
        capacity_result = calculate_capacity(destination, population_requiring_relocation)
        suitability_result = score_destination(habitation, destination, capacity_result)
        ranked.append(suitability_result)

    # Sort by suitability score, but capacity-sufficient destinations always
    # rank above insufficient ones regardless of score - a hard gate, not a
    # soft weighted factor, per the guide's core "technical trap" lesson.
    ranked.sort(key=lambda r: (r.capacity_sufficient, r.suitability_score), reverse=True)

    sufficient_candidates = [r for r in ranked if r.capacity_sufficient]

    if not sufficient_candidates:
        # Never silently recommend an insufficient destination. If nothing
        # qualifies, say so explicitly - this is the "never invent a value,
        # never fail silently" rule applied to the final decision itself.
        return RecommendationResult(
            habitation_id=habitation.habitation_id,
            recommended_destination_id=None,
            recommended_reasons=[],
            next_best_destination_id=ranked[0].destination_id if ranked else None,
            next_best_rejected_reasons=(
                _build_reasons_checklist(ranked[0]) if ranked else []
            ),
            destinations_ranked=ranked,
            excluded_destination_ids=excluded_destination_ids,
            generated_at=datetime.now(timezone.utc).isoformat(),
            explanation=(
                f"No candidate destination has sufficient usable capacity for "
                f"{habitation.name}'s {population_requiring_relocation:.0f} people "
                f"requiring relocation, out of {len(candidates)} destinations "
                f"considered. Escalate to officer for manual review or expand the "
                f"destination search radius."
            ),
        )

    recommended = sufficient_candidates[0]
    next_best = sufficient_candidates[1] if len(sufficient_candidates) > 1 else (
        ranked[1] if len(ranked) > 1 else None
    )

    recommended_reasons = _build_reasons_checklist(recommended)
    next_best_rejected_reasons = (
        _build_rejection_reasons(recommended, next_best) if next_best else []
    )

    explanation = (
        f"RECOMMENDATION: {recommended.destination_id} for {habitation.name} "
        f"(suitability {recommended.suitability_score}/100, {recommended.distance_km:.1f} km away). "
    )
    if next_best:
        explanation += (
            f"NEXT BEST: {next_best.destination_id} "
            f"(suitability {next_best.suitability_score}/100)."
        )

    return RecommendationResult(
        habitation_id=habitation.habitation_id,
        recommended_destination_id=recommended.destination_id,
        recommended_reasons=recommended_reasons,
        next_best_destination_id=next_best.destination_id if next_best else None,
        next_best_rejected_reasons=next_best_rejected_reasons,
        destinations_ranked=ranked,
        excluded_destination_ids=excluded_destination_ids,
        generated_at=datetime.now(timezone.utc).isoformat(),
        explanation=explanation,
    )


def what_if_unavailable(
    habitation: HabitationEvidence,
    destinations: list[Destination],
    population_requiring_relocation: float,
    unavailable_destination_id: str,
    already_excluded: list[str] | None = None,
) -> RecommendationResult:
    """The guide's specific demo 'wow moment': recompute the recommendation
    as if one destination just became unavailable. Thin wrapper around
    generate_recommendation() - the what-if logic IS just re-running the
    same deterministic engine with one more exclusion, which is itself the
    point: nothing special or hardcoded happens for the demo case, it's the
    same real code path."""

    already_excluded = already_excluded or []
    new_exclusions = already_excluded + [unavailable_destination_id]
    return generate_recommendation(
        habitation, destinations, population_requiring_relocation, new_exclusions
    )