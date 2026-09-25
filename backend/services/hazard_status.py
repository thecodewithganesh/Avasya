from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import Evidence, Habitation, HabitationHazard, Hazard
from backend.models.enums import DataOrigin


class HazardStatus(str):
    """String constants so callers never mistype a status."""

    RED = "RED"
    YELLOW = "YELLOW"
    NO_ALERT = "NO_ALERT"
    DATA_UNAVAILABLE = "DATA_UNAVAILABLE"


STATUS_VALUES = {HazardStatus.RED, HazardStatus.YELLOW, HazardStatus.NO_ALERT, HazardStatus.DATA_UNAVAILABLE}

# AVASYA OPERATIONAL METHODOLOGY (not an official government threshold).
# Deliberately conservative defaults, documented in
# docs/10_HAZARD_STATUS_SPEC.md and overridable via HAZARD_STATUS_THRESHOLDS.
DEFAULT_THRESHOLDS: dict[str, dict[str, float]] = {
    # severity/probability in 0-100 from the hazard row
    "_default": {"red": 60.0, "yellow": 30.0},
    "flood": {"red": 60.0, "yellow": 30.0},
    "landslide": {"red": 60.0, "yellow": 30.0},
    "cyclone": {"red": 50.0, "yellow": 25.0},
    "storm_surge": {"red": 50.0, "yellow": 25.0},
    "coastal_erosion": {"red": 60.0, "yellow": 30.0},
    "drought": {"red": 65.0, "yellow": 35.0},
    "lightning": {"red": 60.0, "yellow": 30.0},
}

METHODOLOGY_ID = "AVASYA-HZSTATUS-OPERATIONAL-V1"

# Hazard types where the system must never emit a deterministic forecast.
FORECAST_UNSUPPORTED = {"lightning"}

STALENESS_LIMITS_HOURS: dict[str, float] = {
    "_default": 720.0,          # 30 days for slow hazards
    "flood": 72.0,
    "cyclone": 24.0,
    "storm_surge": 24.0,
    "lightning": 6.0,
}


@dataclass
class HazardStatusResult:
    habitation_id: int
    hazard_id: int | None
    hazard_type: str
    status: str
    severity_score: float | None
    probability_score: float | None
    basis: str  # OBSERVED | OPERATIONAL_THRESHOLD
    evidence_id: int | None
    source_name: str | None
    source_url: str | None
    evidence_time: str | None
    staleness_limit_hours: float | None
    is_stale: bool | None
    reason_codes: list[str] = field(default_factory=list)
    methodology: str = METHODOLOGY_ID
    limitations: list[str] = field(default_factory=list)
    data_origin: str = "MIXED"

    def to_dict(self) -> dict[str, Any]:
        return {
            "habitation_id": self.habitation_id,
            "hazard_id": self.hazard_id,
            "hazard_type": self.hazard_type,
            "status": self.status,
            "severity_score": self.severity_score,
            "probability_score": self.probability_score,
            "basis": self.basis,
            "evidence_id": self.evidence_id,
            "source_name": self.source_name,
            "source_url": self.source_url,
            "evidence_time": self.evidence_time,
            "staleness_limit_hours": self.staleness_limit_hours,
            "is_stale": self.is_stale,
            "reason_codes": self.reason_codes,
            "methodology": self.methodology,
            "limitations": self.limitations,
            "data_origin": self.data_origin,
        }


def _thresholds_for(hazard_type: str) -> dict[str, float]:
    return DEFAULT_THRESHOLDS.get(hazard_type, DEFAULT_THRESHOLDS["_default"])


def _staleness_limit(hazard_type: str) -> float:
    return STALENESS_LIMITS_HOURS.get(hazard_type, STALENESS_LIMITS_HOURS["_default"])


def _as_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def classify(
    hazard_type: str,
    severity: float | None,
    probability: float | None,
    has_evidence: bool,
    is_stale: bool | None = None,
) -> tuple[str, list[str]]:
    """Pure classifier so it is unit-testable without a database.

    Rules:
    - no hazard record, or no scores at all -> DATA_UNAVAILABLE
    - stale evidence -> DATA_UNAVAILABLE (never silently NO_ALERT)
    - supported forecast hazards only: probability can contribute
    - otherwise severity drives RED/YELLOW/NO_ALERT
    """
    reasons: list[str] = []
    thresholds = _thresholds_for(hazard_type)

    if not has_evidence:
        return HazardStatus.DATA_UNAVAILABLE, ["NO_LINKED_HAZARD_EVIDENCE"]
    if severity is None and probability is None:
        return HazardStatus.DATA_UNAVAILABLE, ["NO_USABLE_SEVERITY_OR_PROBABILITY_SCORES"]
    if is_stale:
        return HazardStatus.DATA_UNAVAILABLE, ["EVIDENCE_STALE"]

    # Severity is the primary driver; probability only ever raises concern.
    primary = severity if severity is not None else probability or 0.0
    if severity is None and probability is not None:
        reasons.append("SEVERITY_MISSING_USING_PROBABILITY")

    if primary >= thresholds["red"]:
        status = HazardStatus.RED
        reasons.append("AVASYA_OPERATIONAL_THRESHOLD_RED_EXCEEDED")
    elif primary >= thresholds["yellow"]:
        status = HazardStatus.YELLOW
        reasons.append("AVASYA_OPERATIONAL_THRESHOLD_YELLOW_EXCEEDED")
    else:
        status = HazardStatus.NO_ALERT
        reasons.append("AVASYA_OPERATIONAL_THRESHOLD_BELOW_YELLOW")

    if hazard_type in FORECAST_UNSUPPORTED:
        reasons.append("DETERMINISTIC_FORECAST_UNSUPPORTED_FOR_HAZARD")
    return status, reasons


class HazardStatusService:
    """Resolves the alert state for a habitation from linked hazard + evidence rows."""

    def __init__(self, session: Session):
        self.session = session

    def _latest_evidence(self, hazard_id: int) -> Evidence | None:
        return self.session.scalar(
            select(Evidence)
            .where(Evidence.hazard_id == hazard_id)
            .order_by(Evidence.created_at.desc())
        )

    def _is_stale(self, hazard_type: str, evidence: Evidence | None) -> tuple[bool | None, float, datetime | None]:
        limit = _staleness_limit(hazard_type)
        if evidence is None:
            return None, limit, None
        created: datetime | None = evidence.created_at
        if created is None:
            return True, limit, None
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        age_hours = (datetime.now(timezone.utc) - created).total_seconds() / 3600.0
        return age_hours > limit, limit, created

    def for_habitation(self, habitation_id: int) -> list[HazardStatusResult]:
        habitation = self.session.get(Habitation, habitation_id)
        if habitation is None:
            raise ValueError("Habitation not found")

        links = list(self.session.scalars(
            select(HabitationHazard).where(HabitationHazard.habitation_id == habitation_id)
        ).all())
        results: list[HazardStatusResult] = []
        for link in links:
            hazard = self.session.get(Hazard, link.hazard_id)
            if hazard is None:
                continue
            evidence = self._latest_evidence(hazard.id)
            stale, limit, evidence_time = self._is_stale(hazard.hazard_type, evidence)
            severity = _as_float(hazard.severity_score)
            probability = _as_float(hazard.probability_score)
            status, reasons = classify(
                hazard.hazard_type, severity, probability,
                has_evidence=True, is_stale=bool(stale),
            )
            limitations: list[str] = []
            if hazard.hazard_type in FORECAST_UNSUPPORTED:
                limitations.append(
                    "Lightning: AVASYA does not produce deterministic long-range prediction; "
                    "status reflects available observations/nowcasts only."
                )
            results.append(HazardStatusResult(
                habitation_id=habitation_id,
                hazard_id=hazard.id,
                hazard_type=hazard.hazard_type,
                status=status,
                severity_score=severity,
                probability_score=probability,
                basis="OPERATIONAL_THRESHOLD",
                evidence_id=evidence.id if evidence else None,
                source_name=evidence.source_name if evidence else None,
                source_url=evidence.source_url if evidence else None,
                evidence_time=evidence_time.isoformat() if evidence_time else None,
                staleness_limit_hours=limit,
                is_stale=stale,
                reason_codes=reasons,
                limitations=limitations,
                data_origin=hazard.data_origin.value,
            ))

        if not results:
            results.append(HazardStatusResult(
                habitation_id=habitation_id,
                hazard_id=None,
                hazard_type="any",
                status=HazardStatus.DATA_UNAVAILABLE,
                severity_score=None,
                probability_score=None,
                basis="OBSERVED",
                evidence_id=None,
                source_name=None,
                source_url=None,
                evidence_time=None,
                staleness_limit_hours=None,
                is_stale=None,
                reason_codes=["NO_LINKED_HAZARD_EVIDENCE"],
                limitations=["No hazard records are linked to this habitation in the database."],
                data_origin=DataOrigin.MIXED.value,
            ))
        return results

    def overall(self, habitation_id: int) -> HazardStatusResult:
        """Highest-concern status across linked hazards; DATA_UNAVAILABLE if nothing is evaluable."""
        results = self.for_habitation(habitation_id)
        order = {HazardStatus.RED: 3, HazardStatus.YELLOW: 2, HazardStatus.NO_ALERT: 1, HazardStatus.DATA_UNAVAILABLE: 0}
        best = max(results, key=lambda r: order[r.status])
        if len(results) > 1:
            best.reason_codes = best.reason_codes + [f"AGGREGATED_FROM_{len(results)}_HAZARDS"]
        return best
