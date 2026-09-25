from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.integrations.contracts import ClaimValidationReport, ClaimValidationResult, LlmClaim
from backend.models import CapacityAssessment, Habitation, Recommendation, RecommendationApproval, RelocationPriority, RiskAssessment
from backend.services.hazard_status import HazardStatusService
from backend.services.transport import TransportService


# Fields the LLM may reference and the AVASYA structured source for each.
# Any claim on a field not listed here is UNSUPPORTED by definition.
VALIDATABLE_FIELDS = {
    "population": "habitation.population",
    "households": "habitation.households",
    "latitude": "habitation.latitude",
    "longitude": "habitation.longitude",
    "risk_score": "risk_assessment.overall_risk_score",
    "risk_level": "risk_assessment.risk_level",
    "priority_score": "relocation_priority.priority_score",
    "hazard_status": "hazard_status_engine.status",
    "usable_capacity": "capacity_assessment.usable_capacity",
    "required_capacity": "capacity_assessment.required_capacity",
    "destination_eligibility": "capacity_assessment.eligibility",
    "travel_time_hours": "transport.recommended_route.travel_time_hours",
    "approval_state": "recommendation_approval.action",
}

FLOAT_TOLERANCE_RELATIVE = 0.005   # 0.5 percent
FLOAT_TOLERANCE_ABSOLUTE = 0.05


def _values_match(llm_value: Any, avasya_value: Any) -> bool:
    if isinstance(avasya_value, bool) or isinstance(llm_value, bool):
        return str(llm_value).lower() == str(avasya_value).lower()
    if isinstance(avasya_value, (int, float)) and not isinstance(avasya_value, bool):
        try:
            llm_num = float(llm_value)
        except (TypeError, ValueError):
            return False
        tolerance = max(
            FLOAT_TOLERANCE_ABSOLUTE,
            abs(float(avasya_value)) * FLOAT_TOLERANCE_RELATIVE,
        )
        return abs(llm_num - float(avasya_value)) <= tolerance
    # strings and everything else: exact, case-insensitive
    return str(llm_value).strip().lower() == str(avasya_value).strip().lower()


class ClaimValidator:
    """Validates LLM operational claims against AVASYA structured data.

    VERIFIED    - LLM value matches AVASYA structured value.
    CONFLICT    - AVASYA has a value and it disagrees with the LLM.
    UNSUPPORTED - AVASYA has no structured value for this field, or the
                  field has no defined authoritative source.

    The validator NEVER silently accepts an unbacked operational number.
    """

    def __init__(self, session: Session):
        self.session = session

    def _avasya_value(self, habitation_id: int, field: str) -> tuple[Any | None, str | None]:
        habitation = self.session.get(Habitation, habitation_id)
        if habitation is None:
            return None, None

        if field in {"population", "households", "latitude", "longitude"}:
            return getattr(habitation, field), f"habitations.{field} (habitation_id={habitation_id})"

        if field in {"risk_score", "risk_level"}:
            risk = self.session.scalar(
                select(RiskAssessment)
                .where(RiskAssessment.habitation_id == habitation_id)
                .order_by(RiskAssessment.generated_at.desc())
            )
            if risk is None:
                return None, None
            attr = "overall_risk_score" if field == "risk_score" else "risk_level"
            return getattr(risk, attr), f"risk_assessments.{attr} (latest, id={risk.id})"

        if field == "priority_score":
            priority = self.session.scalar(
                select(RelocationPriority)
                .where(RelocationPriority.habitation_id == habitation_id)
                .order_by(RelocationPriority.created_at.desc())
            )
            return (priority.priority_score, f"relocation_priorities.priority_score (id={priority.id})") if priority else (None, None)

        if field == "hazard_status":
            overall = HazardStatusService(self.session).overall(habitation_id)
            return overall.status, "hazard_status_engine (AVASYA operational methodology)"

        if field in {"usable_capacity", "required_capacity", "destination_eligibility"}:
            capacity = self.session.scalar(
                select(CapacityAssessment)
                .where(CapacityAssessment.habitation_id == habitation_id)
                .order_by(CapacityAssessment.created_at.desc())
            )
            if capacity is None:
                return None, None
            if field == "destination_eligibility":
                return capacity.usable_capacity >= capacity.required_capacity, (
                    f"capacity_assessments (id={capacity.id}) eligibility gate"
                )
            attr = field
            return getattr(capacity, attr), f"capacity_assessments.{attr} (id={capacity.id})"

        if field == "travel_time_hours":
            required = max(1, habitation.population or habitation.households or 1)
            plan = TransportService(self.session).plan(habitation_id, required)
            if plan.recommended_route and plan.recommended_route.travel_time_hours is not None:
                return (
                    plan.recommended_route.travel_time_hours,
                    f"transport.recommended_route (destination_id={plan.recommended_destination_id})",
                )
            return None, None  # travel time genuinely unavailable -> UNSUPPORTED

        if field == "approval_state":
            approval = self.session.scalar(
                select(RecommendationApproval)
                .join(Recommendation, RecommendationApproval.recommendation_id == Recommendation.id)
                .join(RiskAssessment, Recommendation.risk_assessment_id == RiskAssessment.id)
                .where(RiskAssessment.habitation_id == habitation_id)
                .order_by(RecommendationApproval.created_at.desc())
            )
            return (approval.action, f"recommendation_approvals (id={approval.id})") if approval else (None, None)

        return None, None

    def validate(self, habitation_id: int, claims: list[LlmClaim]) -> ClaimValidationReport:
        results: list[ClaimValidationResult] = []
        for claim in claims:
            if claim.field not in VALIDATABLE_FIELDS:
                results.append(ClaimValidationResult(
                    field=claim.field,
                    llm_value=claim.value,
                    avasya_value=None,
                    status="UNSUPPORTED",
                    explanation=(
                        "No AVASYA structured source exists for this field. "
                        "Operational claims must map to a defined authoritative source "
                        "(no defined authoritative source)."
                    ),
                    avasya_source=None,
                ))
                continue
            value, source = self._avasya_value(habitation_id, claim.field)
            if value is None:
                results.append(ClaimValidationResult(
                    field=claim.field,
                    llm_value=claim.value,
                    avasya_value=None,
                    status="UNSUPPORTED",
                    explanation=(
                        "AVASYA has no established structured value for this field "
                        "(evidence unavailable or not yet computed). The LLM claim "
                        "is not accepted as fact."
                    ),
                    avasya_source=None,
                ))
                continue
            if _values_match(claim.value, value):
                results.append(ClaimValidationResult(
                    field=claim.field,
                    llm_value=claim.value,
                    avasya_value=value,
                    status="VERIFIED",
                    explanation="LLM value matches the AVASYA structured value.",
                    avasya_source=source,
                ))
            else:
                results.append(ClaimValidationResult(
                    field=claim.field,
                    llm_value=claim.value,
                    avasya_value=value,
                    status="CONFLICT",
                    explanation=(
                        "LLM value disagrees with AVASYA structured data. "
                        "The AVASYA value is authoritative for operational decisions."
                    ),
                    avasya_source=source,
                ))

        summary = {"VERIFIED": 0, "CONFLICT": 0, "UNSUPPORTED": 0}
        for item in results:
            summary[item.status] += 1
        return ClaimValidationReport(claims=results, summary=summary)
