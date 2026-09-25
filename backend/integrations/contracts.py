from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# RAG integration contract (owned by the RAG teammate; AVASYA only adapts)
# ---------------------------------------------------------------------------

class RagFilter(BaseModel):
    hazard_type: str | None = None
    state: str | None = None
    district: str | None = None


class RagQueryRequest(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    filters: RagFilter = Field(default_factory=RagFilter)
    top_k: int = Field(default=5, ge=1, le=20)


class RagChunk(BaseModel):
    chunk_id: str
    text: str
    source_id: str
    title: str
    authority: str | None = None
    source_url: str | None = None
    page: int | None = None
    section: str | None = None
    published_date: str | None = None
    score: float = Field(ge=0.0, le=1.0)


class RagQueryResponse(BaseModel):
    grounding_status: Literal["SUPPORTED", "UNSUPPORTED"]
    results: list[RagChunk]


# ---------------------------------------------------------------------------
# LLM integration contract (owned by the LLM teammate; AVASYA only adapts)
# ---------------------------------------------------------------------------

class LlmRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    avasya_context: dict[str, Any]
    rag_evidence: list[RagChunk] = Field(default_factory=list)
    # Claims may arrive directly (validation-only requests) or be extracted
    # from the LLM response by the caller.
    claims: list[LlmClaim] = Field(default_factory=list)


class LlmClaim(BaseModel):
    field: str
    value: Any
    unit: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class LlmResponse(BaseModel):
    answer: str
    claims: list[LlmClaim] = Field(default_factory=list)
    citations: list[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Claim validation contract (owned by AVASYA)
# ---------------------------------------------------------------------------

class ClaimValidationResult(BaseModel):
    field: str
    llm_value: Any
    avasya_value: Any | None
    status: Literal["VERIFIED", "CONFLICT", "UNSUPPORTED"]
    explanation: str
    avasya_source: str | None = None


class ClaimValidationReport(BaseModel):
    claims: list[ClaimValidationResult]
    summary: dict[str, int]
