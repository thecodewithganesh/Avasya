"""Structured AVASYA context builder.

Produces the `structured_context` payload handed to the LLM (spec section 27):
only values that come from AVASYA structured services, with explicit
provenance and honest absence — missing values are omitted or set to None,
never replaced with guessed numbers. The LLM may explain these values but is
never their authority.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import CapacityAssessment, Habitation, RiskAssessment
from backend.services.hazard_status import HazardStatusService
from backend.services.response_time import ResponseTimeService


def build_structured_context(db: Session, habitation_id: int) -> dict[str, Any]:
    """Assemble the authoritative AVASYA facts for one habitation."""
    habitation = db.get(Habitation, habitation_id)
    if habitation is None:
        raise ValueError(f"Habitation {habitation_id} not found")

    context: dict[str, Any] = {
        "habitation_id": habitation.id,
        "name": habitation.name,
        "district": habitation.district,
        "state": habitation.state,
        "population": habitation.population,
        "households": habitation.households,
        "coordinates": {
            "latitude": habitation.latitude,
            "longitude": habitation.longitude,
        },
        "data_origin": getattr(habitation.data_origin, "value", str(habitation.data_origin)),
    }

    risk = db.scalar(
        select(RiskAssessment)
        .where(RiskAssessment.habitation_id == habitation_id)
        .order_by(RiskAssessment.id.desc())
        .limit(1)
    )
    if risk is not None:
        context["risk_score"] = risk.overall_risk_score
        context["risk_level"] = risk.risk_level.value if hasattr(risk.risk_level, "value") else risk.risk_level
    else:
        context["risk_score"] = None
        context["risk_level"] = None

    hazard_result = HazardStatusService(db).overall(habitation_id)
    context["hazard_status"] = hazard_result.to_dict()

    response_time: dict[str, Any] | None = None
    try:
        response_time = ResponseTimeService(db).assess(
            habitation_id, hazard_result
        ).to_dict()
    except ValueError:
        response_time = None  # honest absence — never guessed
    if response_time is not None:
        context["response_time"] = response_time

    capacity_rows = list(
        db.scalars(
            select(CapacityAssessment).where(
                CapacityAssessment.habitation_id == habitation_id
            )
        ).all()
    )
    if capacity_rows:
        context["destinations"] = [
            {
                "destination_id": row.destination_id,
                "nominal_capacity": row.nominal_capacity,
                "usable_capacity": row.usable_capacity,
                "required_capacity": row.required_capacity,
                "eligible": row.usable_capacity >= row.required_capacity,
                "data_origin": getattr(
                    getattr(row, "data_origin", None), "value", None
                ),
            }
            for row in capacity_rows
        ]
    else:
        context["destinations"] = []  # explicit empty — the LLM must warn, not invent

    return context


__all__ = ["build_structured_context"]
