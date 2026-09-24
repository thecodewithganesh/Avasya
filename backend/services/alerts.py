from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from backend.services.hazard_status import HazardStatus, HazardStatusResult
from backend.services.response_time import ResponseTimeResult


@dataclass
class Alert:
    hazard: str
    severity: str
    affected_habitation_id: int
    current_status: str
    reason: str
    source_name: str | None
    source_url: str | None
    timestamp: str
    recommended_action: str
    response_window_hours: float | None
    limitations: list[str]
    alert_kind: str = "AVASYA_DECISION_SUPPORT_ALERT"

    def to_dict(self) -> dict[str, Any]:
        return {
            "alert_kind": self.alert_kind,
            "hazard": self.hazard,
            "severity": self.severity,
            "affected_habitation_id": self.affected_habitation_id,
            "current_status": self.current_status,
            "reason": self.reason,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "timestamp": self.timestamp,
            "recommended_action": self.recommended_action,
            "response_window_hours": self.response_window_hours,
            "limitations": self.limitations,
        }


class AlertService:
    """Builds AVASYA DECISION-SUPPORT ALERTS.

    These are explicitly NOT official government warnings. The alert text
    and metadata say so; the UI must display that label verbatim.
    """

    def __init__(self, session: Session):
        self.session = session

    def from_hazard_result(
        self, hazard_result: HazardStatusResult, response: ResponseTimeResult
    ) -> Alert | None:
        now = datetime.now(timezone.utc).isoformat()
        status = hazard_result.status

        if status == HazardStatus.RED:
            action = (
                "Initiate relocation workflow for the affected habitation; verify destination "
                "capacity and transport feasibility before moving population."
            )
            severity = "HIGH"
        elif status == HazardStatus.YELLOW:
            action = (
                "Place habitation on relocation review; monitor authoritative sources and "
                "pre-verify destination readiness."
            )
            severity = "MODERATE"
        elif status == HazardStatus.NO_ALERT:
            action = "No relocation action required; continue monitoring."
            severity = "LOW"
        else:  # DATA_UNAVAILABLE
            action = (
                "Schedule evidence review: hazard state cannot be established because "
                "required evidence is unavailable/stale. Do not treat as no-alert."
            )
            severity = "UNKNOWN"

        reason = "; ".join(hazard_result.reason_codes) or status
        limitations = list(hazard_result.limitations) + [
            "This is an AVASYA decision-support alert, NOT an official government warning.",
        ]
        if response.urgency == "IMMEDIATE" and response.estimated_transport_time_hours is None:
            limitations.append(
                "Urgency is IMMEDIATE but travel time is DATA_UNAVAILABLE; transport planning must "
                "wait for supported road-network evidence."
            )

        return Alert(
            hazard=hazard_result.hazard_type,
            severity=severity,
            affected_habitation_id=hazard_result.habitation_id,
            current_status=status,
            reason=reason,
            source_name=hazard_result.source_name,
            source_url=hazard_result.source_url,
            timestamp=now,
            recommended_action=action,
            response_window_hours=response.available_response_time_hours,
            limitations=limitations,
        )
