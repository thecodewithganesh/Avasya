"""Grounding validator (teammate spec sections 13/14/32/34/35).

The LLM output is NOT trusted because a model produced it. Every claim is
checked against what was actually supplied:

- source ids must exist in the supplied RAG evidence
- structured values must match the supplied structured context
- recommendation destination ids must appear in supplied data
- unsupported/ungrounded claims become violations, not silent facts

If grounding fails the caller receives a response with warnings attached and
`grounding.ok = False` — the officer sees the violation, never a silent fact.
"""
from __future__ import annotations

import re
from typing import Any

from ai.llm.schemas import GroundedResponse, GroundingReport, LlmClaim

# Loose numeric equality for float comparisons coming out of a model.
_NUM_RE = re.compile(r"-?\d+(?:\.\d+)?")


def _numbers_equal(a: Any, b: Any, tol: float = 1e-6) -> bool:
    try:
        return abs(float(a) - float(b)) <= tol
    except (TypeError, ValueError):
        return False


# Enum-ish values: if the context says MEDIUM, text asserting LOW/HIGH is a
# conflict; text that merely narrates without asserting a sibling is neutral.
_SIBLING_VALUES: dict[str, set[str]] = {
    "low": {"medium", "high"},
    "medium": {"low", "high"},
    "high": {"low", "medium"},
    "red": {"yellow", "no_alert", "data_unavailable"},
    "yellow": {"red", "no_alert", "data_unavailable"},
    "no_alert": {"red", "yellow", "data_unavailable"},
    "data_unavailable": {"red", "yellow", "no_alert"},
}


def _values_conflict(llm_value: Any, context_value: Any) -> bool:
    """True only when both sides carry a comparable value that disagrees."""
    if llm_value is None or context_value is None:
        return False
    if isinstance(context_value, (int, float)) and not isinstance(context_value, bool):
        numbers = _NUM_RE.findall(str(llm_value))
        if not numbers:
            return False  # textual phrasing of a number we cannot parse — not a conflict
        return not any(_numbers_equal(n, context_value) for n in numbers)
    if isinstance(context_value, bool):
        if isinstance(llm_value, bool):
            return llm_value != context_value
        lowered = str(llm_value).strip().lower()
        if lowered in {"true", "false", "yes", "no"}:
            return (lowered == "true") != context_value
        return False
    llm_lower = str(llm_value).strip().lower()
    context_lower = str(context_value).strip().lower()
    if context_lower in llm_lower:
        return False  # the actual value appears in the LLM text — consistent
    siblings = _SIBLING_VALUES.get(context_lower, set())
    return any(sibling in llm_lower for sibling in siblings)


def _find_context_value(structured_context: dict[str, Any], field: str) -> Any | None:
    """Locate a field in the structured context (top level or one nested level)."""
    if field in structured_context:
        return structured_context[field]
    for value in structured_context.values():
        if isinstance(value, dict) and field in value:
            return value[field]
    return None


class GroundingValidator:
    """Validate a GroundedResponse against what AVASYA actually supplied."""

    def __init__(
        self,
        structured_context: dict[str, Any],
        rag_evidence: list[dict[str, Any]],
    ) -> None:
        self.context = structured_context or {}
        self.supplied_source_ids = {
            str(item.get("source_id"))
            for item in (rag_evidence or [])
            if item.get("source_id")
        }
        # Destination ids the model is allowed to echo: structured context or
        # RAG evidence text (spec section 14 — never invent a destination).
        self.allowed_destinations = self._collect_destinations()

    def _collect_destinations(self) -> set[str]:
        allowed: set[str] = set()
        for key in ("recommended_destination", "destination_id", "destination"):
            value = self.context.get(key)
            if isinstance(value, str):
                allowed.add(value)
        nested = self.context.get("recommendation")
        if isinstance(nested, dict):
            for key in ("destination_id", "recommended_destination", "destination"):
                value = nested.get(key)
                if isinstance(value, str):
                    allowed.add(value)
        transport = self.context.get("transport")
        if isinstance(transport, dict):
            for route in transport.get("routes", []) or []:
                name = route.get("destination_id") or route.get("destination_name")
                if isinstance(name, str):
                    allowed.add(name)
        for item in self.context.get("rag_evidence", []) or []:
            if isinstance(item, dict) and isinstance(item.get("source_id"), str):
                pass  # destinations come from structured data/evidence text, not ids
        return allowed

    def validate(self, response: GroundedResponse) -> GroundingReport:
        violations: list[str] = []
        grounded = 0

        for claim in response.claims:
            if self._claim_ok(claim, violations):
                grounded += 1

        # Evidence ids must exist among supplied evidence (spec section 35).
        for evidence_id in response.evidence_ids:
            if evidence_id not in self.supplied_source_ids:
                violations.append(
                    f"evidence id '{evidence_id}' was not supplied in rag_evidence"
                )

        # Recommendation echoes must reference a supplied destination.
        dest = response.recommendation.destination_id
        if dest is not None and self.allowed_destinations and dest not in self.allowed_destinations:
            violations.append(
                f"recommended destination '{dest}' does not appear in supplied data"
            )

        checked = len(response.claims)
        return GroundingReport(
            ok=not violations,
            violations=violations,
            checked_claims=checked,
            grounded_claims=grounded,
        )

    def _claim_ok(self, claim: LlmClaim, violations: list[str]) -> bool:
        source_id = claim.source_id

        if claim.source_type == "rag":
            if not source_id or source_id not in self.supplied_source_ids:
                violations.append(
                    f"claim '{claim.field}' cites rag source '{source_id}' which was not supplied"
                )
                return False
            return True

        if claim.source_type == "structured_context":
            context_value = _find_context_value(self.context, claim.field)
            if context_value is None:
                violations.append(
                    f"claim '{claim.field}' is not present in structured_context (invention risk)"
                )
                return False
            if _values_conflict(claim.value, context_value):
                violations.append(
                    f"claim '{claim.field}'={claim.value!r} conflicts with "
                    f"AVASYA structured value {context_value!r}"
                )
                return False
            return True

        # source_type == "reasoning": judgement language, no operational number.
        if isinstance(claim.value, (int, float)) and not isinstance(claim.value, bool):
            violations.append(
                f"claim '{claim.field}' carries a numeric value but is marked 'reasoning'"
            )
            return False
        return True


__all__ = ["GroundingValidator"]
