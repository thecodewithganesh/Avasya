"""Adapter layer for the LLM teammate's module (Qwen3-8B via llama.cpp).

IMPORTANT: This file must never contain a competing LLM implementation. It
adapts the teammate's `ai/llm` module to the AVASYA contract and enforces the
authority boundary: the LLM is NEVER authoritative for operational values
(population, risk, capacity, coordinates, travel time, hazard status,
eligibility, approval state). Those come from AVASYA structured services and
every numeric claim the LLM makes is validated against them.

Wiring states:
  - ai/llm configured (env vars set)  -> live Qwen3 inference with grounding
  - ai/llm not configured             -> 503 integration_pending, honest
"""
from __future__ import annotations

from typing import Any

from backend.integrations.contracts import LlmClaim, LlmRequest, LlmResponse


class LlmIntegrationPending(RuntimeError):
    """Raised when the teammate's LLM runtime has not been configured."""


def _chunk_to_dict(chunk: Any) -> dict[str, Any]:
    if hasattr(chunk, "model_dump"):
        return chunk.model_dump(exclude_none=True)
    return dict(chunk)


class QwenLlmClient:
    """AVASYA contract <-> ai.llm.LlmService adapter."""

    def __init__(self) -> None:
        from ai.llm.llm_service import LlmService

        self._service = LlmService()

    def explain(self, request: LlmRequest) -> LlmResponse:
        from ai.llm.llm_service import LlmNotConfigured, LlmRuntimeError

        if not self._service.is_available():
            raise LlmIntegrationPending(
                "LLM runtime not configured. Set AVASYA_LLM_RUNTIME=cli with "
                "AVASYA_LLM_CLI_PATH + AVASYA_LLM_MODEL_PATH (Qwen3-8B-Q4_K_M.gguf), "
                "or AVASYA_LLM_RUNTIME=server with AVASYA_LLM_SERVER_URL."
            )

        evidence = [_chunk_to_dict(chunk) for chunk in request.rag_evidence]
        context = dict(request.avasya_context)

        try:
            response, report = self._service.assess(
                current_hazard=context.get("hazard_status", {}),
                structured_context=context,
                rag_evidence=evidence,
                question=request.question,
                enforce_grounding=True,
            )
        except LlmNotConfigured as exc:
            raise LlmIntegrationPending(str(exc)) from exc
        except LlmRuntimeError as exc:
            # Runtime answered but output was unusable: honest failure, no
            # fabricated explanation (spec section 34).
            raise LlmIntegrationPending(f"LLM output unusable: {exc}") from exc

        # Contract-boundary enforcement: regardless of what the service did,
        # claims named in grounding violations never reach the officer.
        if not report.ok:
            violation_fields = {
                v.split("'")[1] for v in report.violations if "'" in v
            }
            response = response.model_copy(
                update={
                    "claims": [
                        c for c in response.claims if c.field not in violation_fields
                    ]
                }
            )

        answer = response.reason or "No explanation could be grounded in the supplied evidence."
        if response.warnings:
            answer = answer + "\n\nWarnings:\n" + "\n".join(f"- {w}" for w in response.warnings)
        if report.violations:
            answer = (
                answer
                + "\n\nGrounding violations (claims removed, not trusted):\n"
                + "\n".join(f"- {v}" for v in report.violations)
            )

        return LlmResponse(
            answer=answer,
            claims=[
                LlmClaim(
                    field=claim.field,
                    value=claim.value,
                    confidence=claim.confidence,
                )
                for claim in response.claims
            ],
            citations=list(response.evidence_ids),
        )


def _build_client():
    """Prefer the wired Qwen adapter; fall back to honest-pending stub."""
    try:
        import ai.llm.llm_service  # noqa: F401

        return QwenLlmClient()
    except Exception:  # pragma: no cover - import-time safety net
        return NotImplementedLlmClient()


class NotImplementedLlmClient:
    """Honest placeholder when the ai/llm module itself cannot be imported."""

    def explain(self, request: LlmRequest) -> LlmResponse:
        raise LlmIntegrationPending(
            "LLM module not wired. backend/integrations/llm_client.py must be "
            "pointed at the LLM teammate's implementation."
        )


llm_client = _build_client()
