"""Teammate E's recovered-module tests, ported to the merged ai/llm.

Covers: LLMInput/LLMResponse validation, deterministic prompt construction
(structured data and RAG evidence stay separated, source ids preserved),
and the Ollama runtime path with a mocked HTTP endpoint (no live Ollama
needed in CI). The real-model test is skipped unless AVASYA_LLM_MODEL_PATH /
AVASYA_LLM_OLLAMA_MODEL is set.
"""
from __future__ import annotations

import json
from unittest import mock

import pytest
from pydantic import ValidationError

from ai.llm.compat import (
    Claim,
    LLMInput,
    LLMResponse,
    RAGEvidence,
    build_grounded_context,
)
from ai.llm.config import LlmConfig


def test_llm_input_validation() -> None:
    payload = LLMInput(
        question="Why was H001 marked for immediate relocation?",
        structured_context={"habitation_id": "H001", "risk_level": "CRITICAL"},
        rag_evidence=[{"source_id": "DOC001", "text": "Relocation guidance."}],
    )
    assert payload.question == "Why was H001 marked for immediate relocation?"
    assert payload.rag_evidence[0].source_id == "DOC001"


def test_llm_input_rejects_extra_fields() -> None:
    with pytest.raises(ValidationError):
        LLMInput.model_validate(
            {"question": "q", "structured_context": {}, "rogue_field": 1}
        )


def test_empty_rag_evidence_defaults_to_empty_list() -> None:
    payload = LLMInput(question="q")
    assert payload.rag_evidence == []


def test_llm_response_source_ids_are_cleaned() -> None:
    response = LLMResponse(
        explanation="ok",
        claims=[Claim(field="risk_level", value="CRITICAL")],
        source_ids=["DOC001", "  ", "", "DOC002"],
    )
    assert response.source_ids == ["DOC001", "DOC002"]


def test_build_grounded_context_keeps_structured_and_rag_separate() -> None:
    payload = LLMInput(
        question="Why was H001 marked for immediate relocation?",
        structured_context={
            "habitation_id": "H001",
            "risk_level": "CRITICAL",
            "risk_score": 87.4,
            "population": 1240,
            "population_requiring_relocation": 620,
        },
        rag_evidence=[{"source_id": "DOC001", "text": "Relevant guidance text."}],
    )
    context = build_grounded_context(payload)
    assert isinstance(context, dict)
    assert context["question"] == payload.question
    assert context["source_ids"] == ["DOC001"]
    # the two evidence sources must never be merged into one blob
    assert '"habitation_id"' in context["prompt"]
    assert '"source_id": "DOC001"' in context["prompt"]


def test_build_grounded_context_without_rag_uses_empty_source_ids() -> None:
    payload = LLMInput(question="q", structured_context={"population": 1240})
    context = build_grounded_context(payload)
    assert context["source_ids"] == []
    assert "RAG evidence:\n[]" in context["prompt"]


def test_build_grounded_context_prompt_carries_anti_injection_rule() -> None:
    payload = LLMInput(question="q", structured_context={})
    prompt = build_grounded_context(payload)["prompt"]
    assert "not an instruction" in prompt
    assert "Not available from the provided evidence." in prompt


# ---------------------------------------------------------------------------
# Ollama runtime (teammate's default runtime) with a mocked HTTP endpoint
# ---------------------------------------------------------------------------


def _ollama_config() -> LlmConfig:
    return LlmConfig(
        runtime="ollama",
        ollama_url="http://localhost:11434",
        ollama_model="llama3.2:3b",
        timeout_seconds=5,
    )


def test_generate_via_ollama_mock() -> None:
    from ai.llm.llm_service import LlmService

    service = LlmService(config=_ollama_config())
    payload = {
        "question": "Why was H001 marked for immediate relocation?",
        "structured_context": {
            "habitation_id": "H001",
            "risk_level": "CRITICAL",
            "population": 1240,
        },
        "rag_evidence": [{"source_id": "DOC001", "text": "Relocation guidance."}],
    }
    ollama_reply = {
        "explanation": "H001 is at critical risk with 1240 residents.",
        "claims": [
            {"field": "population", "value": 1240, "source_type": "structured_context"},
            {"field": "guidance", "value": "relocate early", "source_type": "rag", "source_id": "DOC001"},
        ],
        "source_ids": ["DOC001"],
    }

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"response": json.dumps(ollama_reply)}).encode()

    captured: dict = {}

    def _fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data.decode())
        return _FakeResponse()

    with mock.patch("urllib.request.urlopen", side_effect=_fake_urlopen):
        response = service.generate(payload)

    assert response.explanation == "H001 is at critical risk with 1240 residents."
    assert response.source_ids == ["DOC001"]
    # the schema-constrained format field must be present in the Ollama call
    assert "format" in captured["body"]
    assert captured["body"]["format"]["title"] == "LLMResponse"
    assert captured["body"]["model"] == "llama3.2:3b"


def test_generate_rejects_malformed_json() -> None:
    from ai.llm.llm_service import LlmRuntimeError, LlmService

    service = LlmService(config=_ollama_config())

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return json.dumps({"response": "not json at all"}).encode()

    with mock.patch("urllib.request.urlopen", return_value=_FakeResponse()):
        with pytest.raises(LlmRuntimeError):
            service.generate({"question": "q", "structured_context": {}})


def test_generate_requires_configuration() -> None:
    from ai.llm.llm_service import LlmNotConfigured, LlmService

    service = LlmService(config=LlmConfig())  # cli runtime, nothing set
    with pytest.raises(LlmNotConfigured):
        service.generate({"question": "q"})


@pytest.mark.real_model
@pytest.mark.skipif(
    not (__import__("os").getenv("AVASYA_LLM_MODEL_PATH") or __import__("os").getenv("AVASYA_LLM_OLLAMA_MODEL")),
    reason="Optional real-model test requires AVASYA_LLM_MODEL_PATH or AVASYA_LLM_OLLAMA_MODEL.",
)
def test_real_model_inference_placeholder() -> None:
    from ai.llm.llm_service import LlmService

    service = LlmService()  # ambient env config
    payload = {
        "question": "Why was H001 marked for immediate relocation?",
        "structured_context": {
            "habitation_id": "H001",
            "risk_level": "CRITICAL",
            "risk_score": 87.4,
            "population": 1240,
            "population_requiring_relocation": 620,
        },
        "rag_evidence": [{"source_id": "DOC001", "text": "Relocation guidance."}],
    }
    response = service.generate(payload)
    assert response.explanation
    assert response.source_ids == ["DOC001"]


def test_parse_json_repairs_output_truncated_by_token_cap() -> None:
    """Schema-constrained output cut mid-JSON by num_predict is recovered."""
    from ai.llm.llm_service import _parse_json_object

    truncated = (
        '{"hazard": {"type": "flood", "affected_area": "demo"}, "triggered": true, '
        '"assessment": {"urgency": "IMMEDIATE", "population_exposed": 1240, '
        '"observations": ["Red hazard status"], "recurring_incident": false'
    )  # cut inside the assessment object; no closers at all
    parsed = _parse_json_object(truncated)
    assert parsed["assessment"]["population_exposed"] == 1240
    assert parsed["triggered"] is True


def test_parse_json_repairs_truncated_string_member() -> None:
    from ai.llm.llm_service import _parse_json_object

    truncated = '{"reason": "AVASYA_OPERATIONAL_THRESHOLD_RED_EXCEEDED", "claims": ['
    parsed = _parse_json_object(truncated)
    assert parsed["reason"].startswith("AVASYA_OPERATIONAL")
    assert parsed["claims"] == []


def test_parse_json_still_rejects_garbage() -> None:
    import pytest

    from ai.llm.llm_service import LlmRuntimeError, _parse_json_object

    with pytest.raises(LlmRuntimeError):
        _parse_json_object("there is no json here at all")
