from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from backend.models import Habitation
from backend.models.enums import DataOrigin
from backend.services.alerts import AlertService
from backend.services.decision import DecisionService
from backend.services.hazard_status import HazardStatusService
from backend.services.response_time import ResponseTimeService
from backend.services.transport import TransportService


@dataclass
class PipelineResult:
    habitation_id: int
    hazard_statuses: list[dict[str, Any]]
    overall_hazard_status: str
    risk: dict[str, Any]
    relocation_priority: dict[str, Any]
    recommendation: dict[str, Any]
    transport: dict[str, Any]
    response_time: dict[str, Any]
    alert: dict[str, Any] | None
    chain: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "habitation_id": self.habitation_id,
            "hazard_statuses": self.hazard_statuses,
            "overall_hazard_status": self.overall_hazard_status,
            "risk": self.risk,
            "relocation_priority": self.relocation_priority,
            "recommendation": self.recommendation,
            "transport": self.transport,
            "response_time": self.response_time,
            "alert": self.alert,
            "chain": self.chain,
            "warnings": self.warnings,
        }


class DecisionPipelineService:
    """Runs the complete decision chain as ONE integrated flow:

    hazard evidence -> hazard status -> risk -> relocation priority
    -> destination capacity gate -> transport optimization
    -> response time -> decision-support alert.

    Every stage's output is derived from actual database evidence and every
    stage is traceable; the officer still makes the final call.
    """

    def __init__(self, session: Session):
        self.session = session

    def run(self, habitation_id: int) -> PipelineResult:
        habitation = self.session.get(Habitation, habitation_id)
        if habitation is None:
            raise ValueError("Habitation not found")

        chain: list[str] = []
        warnings: list[str] = []

        # 1. Hazard status (RED/YELLOW/NO_ALERT/DATA_UNAVAILABLE)
        hazard_service = HazardStatusService(self.session)
        hazard_results = hazard_service.for_habitation(habitation_id)
        overall = hazard_service.overall(habitation_id)
        chain.append(f"hazard_status:{overall.status}")
        for item in hazard_results:
            warnings.extend(f"hazard[{item.hazard_type}]: {lim}" for lim in item.limitations)
        if overall.status == "DATA_UNAVAILABLE":
            warnings.append(
                "Hazard status is DATA_UNAVAILABLE; downstream risk used persisted evidence only."
            )

        # 2-4. Risk -> priority -> recommendation (locked methodology, capacity gate)
        decision = DecisionService(self.session).assess(habitation_id)
        chain.append(f"risk:{decision.risk.risk_level}({decision.risk.overall_risk_score})")
        chain.append(f"priority:{decision.priority.priority_label}")
        chain.append(f"recommendation:{decision.recommendation.summary}")
        warnings.extend(decision.risk.warnings.get("items", []))

        # 5. Transport optimization (capacity-constrained route ranking)
        required_capacity = decision.priority.rationale.get("required_capacity") or max(
            1, habitation.population or habitation.households or 1
        )
        try:
            transport = TransportService(self.session).plan(habitation_id, int(required_capacity))
            transport_dict = transport.to_dict()
            chain.append(
                f"transport:{'route_to_' + str(transport.recommended_destination_id) if transport.recommended_destination_id else 'NO_FEASIBLE_ROUTE'}"
            )
            warnings.extend(transport.limitations)
            transport_time = (
                transport.recommended_route.travel_time_hours
                if transport.recommended_route
                else None
            )
        except ValueError as exc:
            transport = None
            transport_dict = {"error": str(exc), "status": "DATA_UNAVAILABLE"}
            transport_time = None
            warnings.append(f"Transport planning unavailable: {exc}")

        # 6. Response time / urgency
        response = ResponseTimeService(self.session).assess(
            habitation_id, overall, transport_time_hours=transport_time
        )
        chain.append(f"response_time:{response.urgency}")

        # 7. Decision-support alert (NOT an official government warning).
        # When transport resolved a destination, the teammate-owned alert
        # builder enriches the recommended action with that destination.
        alert = AlertService(self.session).from_hazard_result(overall, response)
        if alert is not None and transport is not None and transport.recommended_route is not None:
            from backend.transportation import build_relocation_alert

            relocation_alert = build_relocation_alert(
                alert_id=f"AVASYA-{habitation_id}-{overall.hazard_type.upper()[:12]}",
                hazard=overall.hazard_type,
                severity=(
                    "HIGH" if overall.status == "RED"
                    else "MODERATE" if overall.status == "YELLOW"
                    else "LOW"
                ),
                habitation_name=habitation.name,
                reason="; ".join(overall.reason_codes) or overall.status,
                response_window=(
                    f"Within {response.available_response_time_hours} hours"
                    if response.available_response_time_hours is not None
                    else "Response window DATA_UNAVAILABLE"
                ),
                source=overall.source_name or "AVASYA decision-support pipeline",
                destination_name=transport.recommended_route.destination_name,
                official_source=False,
            )
            alert_dict = alert.to_dict()
            alert_dict["recommended_action"] = relocation_alert.recommended_action
            alert = alert  # keep Alert instance; the enriched dict is re-applied below
            enriched_alert_action = alert_dict["recommended_action"]
        else:
            enriched_alert_action = None
        chain.append("alert:generated" if alert else "alert:none")

        return PipelineResult(
            habitation_id=habitation_id,
            hazard_statuses=[item.to_dict() for item in hazard_results],
            overall_hazard_status=overall.status,
            risk={
                "id": decision.risk.id,
                "score": decision.risk.overall_risk_score,
                "level": decision.risk.risk_level,
                "contributions": decision.risk.contributions,
                "weights": decision.risk.weights,
                "confidence": decision.risk.confidence_score,
                "data_origin": decision.risk.data_origin.value,
                "calculation_details": decision.risk.calculation_details,
            },
            relocation_priority={
                "id": decision.priority.id,
                "score": decision.priority.priority_score,
                "label": decision.priority.priority_label,
                "rationale": decision.priority.rationale,
                "required_capacity": required_capacity,
            },
            recommendation={
                "id": decision.recommendation.id,
                "summary": decision.recommendation.summary,
                "type": decision.recommendation.recommendation_type,
                "destination_id": decision.recommendation.destination_id,
                "details": decision.recommendation.details,
                "data_origin": decision.recommendation.data_origin.value,
            },
            transport=transport_dict,
            response_time=response.to_dict(),
            alert={**alert.to_dict(), "recommended_action": enriched_alert_action} if (alert and enriched_alert_action) else (alert.to_dict() if alert else None),
            chain=chain,
            warnings=warnings,
        )
