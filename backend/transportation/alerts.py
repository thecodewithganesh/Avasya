"""AVASYA Decision-Support Alert framework.

Freebuff may produce decision support, but must not represent it as an official
government alert unless the source is actually an official issuing authority.
"""

from __future__ import annotations

from typing import Literal

from .models import DecisionSupportAlert

Severity = Literal["LOW", "MODERATE", "HIGH", "CRITICAL"]


def build_alert(
    *,
    alert_id: str,
    hazard: str,
    severity: Severity,
    affected_habitation: str,
    reason: str,
    recommended_action: str,
    response_window: str,
    source: str,
    official_source: bool = False,
) -> DecisionSupportAlert:
    """Create an alert with the required AVASYA decision-support fields."""

    if not source.strip():
        raise ValueError("Every alert must include a source.")
    return DecisionSupportAlert(
        alert_id=alert_id,
        hazard=hazard,
        severity=severity,
        affected_habitation=affected_habitation,
        reason=reason,
        recommended_action=recommended_action,
        response_window=response_window,
        source=source,
        official=official_source,
    )


def build_relocation_alert(
    *,
    alert_id: str,
    hazard: str,
    severity: Severity,
    habitation_name: str,
    reason: str,
    response_window: str,
    source: str,
    destination_name: str | None = None,
    official_source: bool = False,
) -> DecisionSupportAlert:
    """Create a consistent relocation recommendation from hazard evidence."""

    action = "Initiate relocation assessment and move people to a capacity-feasible safe destination."
    if destination_name:
        action = f"Initiate relocation assessment toward {destination_name}; confirm capacity before movement."
    return build_alert(
        alert_id=alert_id,
        hazard=hazard,
        severity=severity,
        affected_habitation=habitation_name,
        reason=reason,
        recommended_action=action,
        response_window=response_window,
        source=source,
        official_source=official_source,
    )
