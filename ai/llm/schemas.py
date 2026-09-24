"""LLM I/O schemas (teammate spec sections 18, 21, 33, 35).

These are the exact structures the teammate's architecture document defines.
Stage 1 produces a retrieval plan; Stage 2 produces the grounded assessment.
Every claim must trace to `structured_context` or a supplied `source_id` —
the grounding validator rejects anything else.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


# ---------------------------------------------------------------------------
# Stage 1 — Hazard understanding / retrieval plan (Prompt A, spec section 21)
# ---------------------------------------------------------------------------

class RetrievalPlan(BaseModel):
    hazard_type: str | None = None
    affected_area: str | None = None
    retrieval_requirements: list[str] = Field(default_factory=list, max_length=12)
    missing_information: list[str] = Field(default_factory=list)

    @field_validator("retrieval_requirements", "missing_information")
    @classmethod
    def _strings_nonempty(cls, value: list[str]) -> list[str]:
        return [item.strip() for item in value if item and item.strip()]


# ---------------------------------------------------------------------------
# Stage 2 — Grounded assessment (spec sections 18 and 33)
# ---------------------------------------------------------------------------

class LlmClaim(BaseModel):
    """One factual assertion with its provenance (spec section 32)."""

    field: str
    value: Any
    source_type: Literal["structured_context", "rag", "reasoning"]
    source_id: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class LlmAssessment(BaseModel):
    triggered: bool = False
    recurring_incident: bool | None = None
    urgency: Literal["IMMEDIATE", "SHORT_TERM", "MEDIUM_TERM", "MONITOR"] | None = None
    population_exposed: int | None = Field(default=None, ge=0)
    observations: list[str] = Field(default_factory=list)


class LlmRecommendationEcho(BaseModel):
    """Echoes an AVASYA-computed destination — the LLM never invents one.

    A destination id that did not appear in structured_context or rag_evidence
    is rejected by the grounding validator (spec section 14).
    """

    destination_id: str | None = None
    notes: str | None = None


class GroundedResponse(BaseModel):
    """The full Stage 2 payload handed to AVASYA validation (spec section 33)."""

    hazard: dict[str, Any] = Field(default_factory=dict)
    triggered: bool = False
    assessment: LlmAssessment = Field(default_factory=LlmAssessment)
    recommendation: LlmRecommendationEcho = Field(default_factory=LlmRecommendationEcho)
    reason: str = ""
    claims: list[LlmClaim] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class GroundingReport(BaseModel):
    """Result of validation against supplied inputs (spec section 35)."""

    ok: bool
    violations: list[str] = Field(default_factory=list)
    checked_claims: int = 0
    grounded_claims: int = 0


__all__ = [
    "GroundedResponse",
    "GroundingReport",
    "LlmAssessment",
    "LlmClaim",
    "LlmRecommendationEcho",
    "RetrievalPlan",
]
