"""
Tests for pipeline.py itself - NOT for the five engines it calls (those
already have their own test files and are not re-tested here).

What's actually being verified here is the sequencing/wiring logic that
only exists in pipeline.py: that run_decision()'s contract dict matches
the frozen guide format exactly, that the recommended destination's full
capacity breakdown is correctly attached, that run_what_if() actually
changes the outcome (not just accepts the parameter), and that the
"nothing qualifies" path never invents a recommendation.
"""

from __future__ import annotations

import pytest

from ai.pipeline import DecisionResult, run_decision, run_what_if
from ai.schemas.contracts import Destination, Geometry, HabitationEvidence


def _evidence(**overrides) -> HabitationEvidence:
    base = dict(
        habitation_id="H001",
        name="Krishnapuram Village",
        population=1240,
        population_exposed=620.0,
        hazard_exposure=0.5,
        vulnerability=0.71,
        historical_events=3,
        hospital_distance_km=1.63,
        nearest_road_distance_km=0.0,
        road_accessibility=1.0,
        nearest_relief_center_id="RC02",
        nearest_relief_center_distance_km=1.72,
        nearest_relief_center_capacity=1200,
        nearest_relief_center_water_available=True,
        geometry=Geometry(type="Point", coordinates=(80.205, 13.405)),
        district="Thanjavur",
        data_source="SYNTHETIC_DEMO",
        data_quality="SYNTHETIC_DEMO",
    )
    base.update(overrides)
    return HabitationEvidence.model_validate(base)


def _destination(destination_id: str, **overrides) -> Destination:
    base = dict(
        destination_id=destination_id,
        name=f"Relief Center {destination_id}",
        nominal_capacity=1800,
        existing_occupancy=300,
        water_available=True,
        sanitation_ok=True,
        healthcare_distance_km=2.2,
        road_access=0.9,
        geometry=Geometry(type="Point", coordinates=(80.225, 13.425)),
        district="Thanjavur",
        data_source="SYNTHETIC_DEMO",
        data_quality="SYNTHETIC_DEMO",
    )
    base.update(overrides)
    return Destination.model_validate(base)


@pytest.fixture
def evidence() -> HabitationEvidence:
    return _evidence()


@pytest.fixture
def destinations() -> list[Destination]:
    return [
        _destination("RC01", nominal_capacity=1800, existing_occupancy=300, healthcare_distance_km=2.2),
        _destination(
            "RC02",
            nominal_capacity=1200,
            existing_occupancy=200,
            healthcare_distance_km=1.1,
            geometry=Geometry(type="Point", coordinates=(80.225, 13.395)),
        ),
        _destination(
            "RC03",
            nominal_capacity=900,
            existing_occupancy=150,
            water_available=False,
            sanitation_ok=False,
            healthcare_distance_km=5.6,
            road_access=0.6,
            geometry=Geometry(type="Point", coordinates=(80.245, 13.415)),
        ),
    ]


def test_run_decision_returns_decision_result(evidence, destinations):
    decision = run_decision(evidence, destinations)
    assert isinstance(decision, DecisionResult)
    assert decision.habitation_id == "H001"
    assert decision.recommendation.recommended_destination_id is not None


def test_contract_dict_matches_frozen_guide_format(evidence, destinations):
    decision = run_decision(evidence, destinations)
    contract = decision.to_contract_dict()

    assert set(contract.keys()) == {
        "habitation_id",
        "risk_score",
        "risk_level",
        "priority",
        "reasons",
        "recommended_destination",
        "capacity_sufficient",
    }
    assert contract["habitation_id"] == "H001"
    assert isinstance(contract["risk_score"], float)
    assert contract["risk_level"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
    assert contract["priority"] in {"IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM"}
    assert isinstance(contract["reasons"], list) and len(contract["reasons"]) > 0
    assert isinstance(contract["capacity_sufficient"], bool)


def test_recommended_capacity_matches_the_recommended_destination(evidence, destinations):
    decision = run_decision(evidence, destinations)
    recommended_id = decision.recommendation.recommended_destination_id

    assert recommended_id is not None
    assert decision.recommended_capacity is not None
    assert decision.recommended_capacity.destination_id == recommended_id
    # The contract dict's capacity_sufficient must come from this same
    # object, not be recomputed some other way.
    assert (
        decision.to_contract_dict()["capacity_sufficient"]
        == decision.recommended_capacity.capacity_sufficient
    )


def test_what_if_actually_changes_the_recommendation(evidence, destinations):
    original = run_decision(evidence, destinations)
    top_pick = original.recommendation.recommended_destination_id
    assert top_pick is not None

    revised = run_what_if(evidence, destinations, unavailable_destination_id=top_pick)

    assert revised.recommendation.recommended_destination_id != top_pick
    assert top_pick in revised.excluded_destination_ids
    # Risk/priority are about the habitation, not the destination set -
    # they must stay identical across the what-if recalculation.
    assert revised.risk.risk_score == original.risk.risk_score
    assert revised.priority.priority == original.priority.priority


def test_what_if_with_unknown_destination_id_does_not_crash(evidence, destinations):
    # A stale or mistyped id should just have no effect, not raise.
    decision = run_what_if(evidence, destinations, unavailable_destination_id="RC99")
    assert decision.recommendation.recommended_destination_id is not None


def test_no_eligible_destination_never_invents_a_recommendation(evidence):
    tiny_destination = _destination(
        "RC_TINY", nominal_capacity=10, existing_occupancy=5
    )
    decision = run_decision(evidence, [tiny_destination])
    contract = decision.to_contract_dict()

    assert contract["recommended_destination"] is None
    assert contract["capacity_sufficient"] is False
    assert decision.recommended_capacity is None


def test_exclude_all_destinations_yields_no_recommendation(evidence, destinations):
    all_ids = [d.destination_id for d in destinations]
    decision = run_decision(evidence, destinations, exclude=all_ids)

    assert decision.recommendation.recommended_destination_id is None
    assert decision.to_contract_dict()["capacity_sufficient"] is False


def test_what_if_can_be_chained_with_already_excluded(evidence, destinations):
    first = run_what_if(evidence, destinations, unavailable_destination_id="RC02")
    second_pick = first.recommendation.recommended_destination_id
    assert second_pick is not None

    second = run_what_if(
        evidence,
        destinations,
        unavailable_destination_id=second_pick,
        already_excluded=first.excluded_destination_ids,
    )

    assert "RC02" in second.excluded_destination_ids
    assert second_pick in second.excluded_destination_ids
    assert second.recommendation.recommended_destination_id not in {"RC02", second_pick}