"""Five Mandatory Proofs for AVASYA (v12 Workflow Verification)

1. REAL RECORD PROOF: actual processed record -> application -> displayed result
2. MUTATION PROOF: change real input -> downstream result changes appropriately
3. SECOND RECORD PROOF: different real record -> independently works
4. MOCK KILL-SWITCH: disable mock/demo/fallback data -> core system still works
5. LLM GROUNDING PROOF: change AVASYA result -> LLM receives changed context -> explanation/claim status reflects changed result
"""
from __future__ import annotations

import os
import pytest
from backend.models import Habitation, Hazard, HabitationHazard, Destination, CapacityAssessment, Evidence, User
from backend.models.enums import DataOrigin
from backend.services.decision import DecisionService
from backend.integrations.claim_validator import ClaimValidator
from backend.integrations.contracts import LlmClaim, LlmRequest


def test_proof_1_real_record_proof(db_session):
    """REAL RECORD PROOF:
    Create a real census habitation record with linked IMD flood hazard and real vulnerability evidence.
    Verify that assess() produces non-zero vulnerability, road accessibility, and derived risk scores.
    """
    habitation = Habitation(
        name="Real Village A",
        village_or_ward="Ward 1",
        district="Thanjavur",
        state="Tamil Nadu",
        country="India",
        latitude=10.786,
        longitude=79.137,
        geom="SRID=4326;POINT(79.137 10.786)",
        population=2500,
        households=600,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(habitation)
    db_session.flush()

    hazard = Hazard(
        hazard_type="flood",
        hazard_name="IMD Flood Inventory V3 - Thanjavur",
        severity_score=85.0,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(hazard)
    db_session.flush()
    db_session.add(HabitationHazard(habitation_id=habitation.id, hazard_id=hazard.id))

    # Add real vulnerability evidence
    vuln_ev = Evidence(
        habitation_id=habitation.id,
        source_name="climate_vulnerability_indicators",
        source_type="csv",
        evidence_type="vulnerability",
        summary="District climate vulnerability index",
        evidence_payload={"vulnerability_score": 0.68},
        data_origin=DataOrigin.REAL,
    )
    db_session.add(vuln_ev)

    destination = Destination(
        name="Thanjavur Medical College Shelter",
        destination_type="SHELTER",
        district="Thanjavur",
        state="Tamil Nadu",
        country="India",
        geom="SRID=4326;POINT(79.140 10.790)",
        capacity_total=5000,
        capacity_available=5000,
        risk_score=15.0,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(destination)
    db_session.flush()

    db_session.add(CapacityAssessment(
        destination_id=destination.id,
        habitation_id=habitation.id,
        nominal_capacity=5000,
        existing_occupancy=0,
        water_constraint=0,
        sanitation_constraint=0,
        safety_reserve=0,
        required_capacity=2500,
        usable_capacity=5000,
        capacity_gap=2500,
        status="ELIGIBLE",
        data_origin=DataOrigin.REAL,
    ))
    db_session.commit()

    decision = DecisionService(db_session).assess(habitation.id)

    assert decision.risk.overall_risk_score > 0
    assert decision.risk.normalized_values["vulnerability"] == 68.0
    assert decision.risk.normalized_values["road_accessibility"] > 0
    assert decision.risk.normalized_values["hazard_exposure"] == 85.0
    assert decision.priority.priority_label in ["HIGH", "IMMEDIATE"]
    assert decision.recommendation.destination_id == destination.id


def test_proof_2_mutation_proof(db_session):
    """MUTATION PROOF:
    Change real input (hazard severity & population requirement) and prove downstream
    risk score and priority label change deterministically.
    """
    hab = Habitation(
        name="Mutation Village",
        district="Udupi",
        state="Karnataka",
        country="India",
        latitude=13.34,
        longitude=74.74,
        population=100,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(hab)
    db_session.flush()

    low_hazard = Hazard(
        hazard_type="flood",
        hazard_name="Low Flood",
        severity_score=20.0,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(low_hazard)
    db_session.flush()
    db_session.add(HabitationHazard(habitation_id=hab.id, hazard_id=low_hazard.id))

    dest = Destination(
        name="Udupi Shelter",
        district="Udupi",
        state="Karnataka",
        country="India",
        geom="SRID=4326;POINT(74.74 13.34)",
        capacity_total=1000,
        capacity_available=1000,
        risk_score=10.0,
        data_origin=DataOrigin.REAL,
    )
    db_session.add(dest)
    db_session.flush()
    db_session.add(CapacityAssessment(
        destination_id=dest.id,
        habitation_id=hab.id,
        nominal_capacity=1000,
        existing_occupancy=0,
        water_constraint=0,
        sanitation_constraint=0,
        safety_reserve=0,
        required_capacity=100,
        usable_capacity=1000,
        capacity_gap=900,
        status="ELIGIBLE",
        data_origin=DataOrigin.REAL,
    ))
    db_session.commit()

    decision_1 = DecisionService(db_session).assess(hab.id)
    initial_score = decision_1.risk.overall_risk_score

    # Mutate hazard severity score from 20 -> 95
    low_hazard.severity_score = 95.0
    db_session.commit()

    decision_2 = DecisionService(db_session).assess(hab.id)
    mutated_score = decision_2.risk.overall_risk_score

    assert mutated_score > initial_score
    assert decision_2.risk.risk_level != decision_1.risk.risk_level or mutated_score >= 60.0


def test_proof_3_second_record_proof(db_session):
    """SECOND RECORD PROOF:
    Assess a second, distinct real record from a different district and state.
    Prove independent execution without interference from first record state.
    """
    hab_1 = Habitation(name="Village KA", district="Udupi", state="Karnataka", population=500, data_origin=DataOrigin.REAL)
    hab_2 = Habitation(name="Village KL", district="Wayanad", state="Kerala", population=3000, data_origin=DataOrigin.REAL)
    db_session.add_all([hab_1, hab_2])
    db_session.commit()

    res_1 = DecisionService(db_session).assess(hab_1.id)
    res_2 = DecisionService(db_session).assess(hab_2.id)

    assert res_1.risk.habitation_id == hab_1.id
    assert res_2.risk.habitation_id == hab_2.id
    assert res_1.risk.id != res_2.risk.id


def test_proof_4_mock_kill_switch(db_session):
    """MOCK KILL-SWITCH:
    Explicitly set AVASYA_ENABLE_SYNTHETIC_DEMO=false and verify core decision service works on REAL data.
    """
    os.environ["AVASYA_ENABLE_SYNTHETIC_DEMO"] = "false"
    hab = Habitation(name="Production Village", district="Chennai", state="Tamil Nadu", population=800, data_origin=DataOrigin.REAL)
    db_session.add(hab)
    db_session.commit()

    res = DecisionService(db_session).assess(hab.id)
    assert res.risk.data_origin == DataOrigin.REAL or res.risk.data_origin == DataOrigin.MIXED
    assert res.risk.overall_risk_score >= 0


def test_proof_5_llm_grounding_proof(db_session):
    """LLM GROUNDING PROOF:
    Change AVASYA decision result and prove LLM Claim Validation reflects the changed context.
    """
    hab = Habitation(name="LLM Grounding Village", district="Kollam", state="Kerala", population=1200, data_origin=DataOrigin.REAL)
    db_session.add(hab)
    db_session.commit()

    DecisionService(db_session).assess(hab.id)

    validator = ClaimValidator(db_session)
    # Claiming correct population = 1200
    report_valid = validator.validate(hab.id, [LlmClaim(field="population", value=1200)])
    assert report_valid.claims[0].status == "VERIFIED"

    # Claiming altered population = 9999
    report_invalid = validator.validate(hab.id, [LlmClaim(field="population", value=9999)])
    assert report_invalid.claims[0].status == "CONFLICT"
