from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from backend.models import Habitation
from backend.models.enums import DataOrigin
from backend.services.hazard_status import HazardStatus, HazardStatusResult


METHODOLOGY_ID = "AVASYA-RESPONSETIME-OPERATIONAL-V1"

URGENCY_LEVELS = {"IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "MONITOR"}


@dataclass
class ResponseTimeResult:
    habitation_id: int
    urgency: str
    hazard_status: str
    hazard_type: str
    available_response_time_hours: float | None
    estimated_transport_time_hours: float | None
    buffer_hours: float | None
    time_established: bool
    population_exposed: int | None
    reason_codes: list[str] = field(default_factory=list)
    methodology: str = METHODOLOGY_ID
    limitations: list[str] = field(default_factory=list)
    data_origin: str = DataOrigin.MIXED.value

    def to_dict(self) -> dict[str, Any]:
        return {
            "habitation_id": self.habitation_id,
            "urgency": self.urgency,
            "hazard_status": self.hazard_status,
            "hazard_type": self.hazard_type,
            "available_response_time_hours": self.available_response_time_hours,
            "estimated_transport_time_hours": self.estimated_transport_time_hours,
            "buffer_hours": self.buffer_hours,
            "time_established": self.time_established,
            "population_exposed": self.population_exposed,
            "reason_codes": self.reason_codes,
            "methodology": self.methodology,
            "limitations": self.limitations,
            "data_origin": self.data_origin,
        }


def compute_urgency(
    hazard_status: str,
    population: int | None,
    transport_time_hours: float | None,
) -> tuple[str, list[str]]:
    """Pure urgency classifier.

    AVASYA OPERATIONAL METHODOLOGY - not an official government standard.
    - RED hazard           -> IMMEDIATE
    - YELLOW hazard        -> SHORT_TERM (MEDIUM_TERM if very small population)
    - NO_ALERT             -> MONITOR
    - DATA_UNAVAILABLE     -> MEDIUM_TERM review, because the correct operational
      response to unknown hazard state is a scheduled review, not silence.
    Transport time never lowers urgency; it only raises it (a RED hazard with a
    very long transport time is still IMMEDIATE, but the limitation is reported).
    """
    reasons: list[str] = []
    if hazard_status == HazardStatus.RED:
        reasons.append("RED_HAZARD_STATUS")
        return "IMMEDIATE", reasons
    if hazard_status == HazardStatus.YELLOW:
        if population is not None and population < 200:
            reasons.append("YELLOW_HAZARD_STATUS_SMALL_POPULATION")
            return "MEDIUM_TERM", reasons
        reasons.append("YELLOW_HAZARD_STATUS")
        return "SHORT_TERM", reasons
    if hazard_status == HazardStatus.NO_ALERT:
        reasons.append("NO_ALERT_EVIDENCE_CHECKED")
        return "MONITOR", reasons
    # DATA_UNAVAILABLE
    reasons.append("HAZARD_STATUS_DATA_UNAVAILABLE_SCHEDULED_REVIEW")
    return "MEDIUM_TERM", reasons


class ResponseTimeService:
    def __init__(self, session: Session):
        self.session = session

    def assess(
        self,
        habitation_id: int,
        hazard_result: HazardStatusResult,
        transport_time_hours: float | None = None,
    ) -> ResponseTimeResult:
        habitation = self.session.get(Habitation, habitation_id)
        if habitation is None:
            raise ValueError("Habitation not found")

        population = habitation.population
        urgency, reasons = compute_urgency(
            hazard_result.status, population, transport_time_hours
        )

        limitations: list[str] = [
            "AVASYA operational methodology; not an official government response-time standard.",
        ]
        if hazard_result.status == HazardStatus.DATA_UNAVAILABLE:
            limitations.append(
                "Available response time cannot be established because hazard evidence is "
                "unavailable/stale; urgency is a scheduled-review posture."
            )
        if transport_time_hours is None:
            limitations.append(
                "Estimated transport time is DATA_UNAVAILABLE (no supported road-network "
                "travel-time evidence); it was not invented."
            )

        # available_response_time is only stated when we actually have a basis:
        # a valid warning/forecast validity window would supply it. We do not have
        # a validity field yet, so we report it as not established unless the
        # hazard status itself carries evidence_time we can anchor to.
        available: float | None = None
        if hazard_result.status in (HazardStatus.RED, HazardStatus.YELLOW) and transport_time_hours is not None:
            # Defensible floor: response must at least cover transport + buffer.
            buffer = max(1.0, transport_time_hours * 0.25)
            available = round(transport_time_hours + buffer, 2)

        return ResponseTimeResult(
            habitation_id=habitation_id,
            urgency=urgency,
            hazard_status=hazard_result.status,
            hazard_type=hazard_result.hazard_type,
            available_response_time_hours=available,
            estimated_transport_time_hours=transport_time_hours,
            buffer_hours=round(max(1.0, transport_time_hours * 0.25), 2) if transport_time_hours is not None else None,
            time_established=transport_time_hours is not None,
            population_exposed=population,
            reason_codes=reasons + list(hazard_result.reason_codes),
            limitations=limitations + list(hazard_result.limitations),
            data_origin=hazard_result.data_origin,
        )
