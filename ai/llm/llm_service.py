"""Qwen3-8B Q4_K_M inference via llama.cpp (teammate spec sections 22-24, 34).

Two runtimes:
- "cli":    one `llama-cli -m <model> -p <prompt>` process per call.
- "server": llama.cpp `llama-server` OpenAI-compatible HTTP endpoint.

Output handling (spec section 34): Qwen3 may emit reasoning before the final
answer, so raw stdout is never trusted — the final JSON object is extracted,
parsed, schema-validated, then grounding-checked before anything reaches the
officer. Hidden reasoning is never exposed.
"""
from __future__ import annotations

import json
import subprocess
from typing import Any

from ai.llm.config import LlmConfig, LlmNotConfiguredError, llm_config
from ai.llm.grounding import GroundingValidator
from ai.llm.prompts import (
    build_evidence_reasoning_prompt,
    build_hazard_understanding_prompt,
)
from ai.llm.schemas import (
    GroundedResponse,
    GroundingReport,
    RetrievalPlan,
)


class LlmNotConfigured(RuntimeError):
    """No llama.cpp runtime configured — callers must surface honest 503s."""


class LlmRuntimeError(RuntimeError):
    """The runtime answered but the output could not be parsed/validated."""


class LlmService:
    """Stage 1 (retrieval plan) + Stage 2 (grounded assessment)."""

    def __init__(self, config: LlmConfig | None = None) -> None:
        self.config = config or llm_config

    # -- public API ----------------------------------------------------------

    def is_available(self) -> bool:
        return self.config.is_configured

    def build_retrieval_plan(self, event: dict[str, Any]) -> RetrievalPlan:
        """Stage 1 — understand the hazard event, plan what RAG must fetch."""
        prompt = build_hazard_understanding_prompt(event)
        raw = self._infer(prompt, RetrievalPlan.model_json_schema())
        plan = _parse_json_object(raw)
        try:
            return RetrievalPlan.model_validate(plan)
        except Exception as exc:  # pydantic ValidationError or shape mismatch
            raise LlmRuntimeError(f"Stage-1 output failed schema validation: {exc}") from exc

    def assess(
        self,
        current_hazard: dict[str, Any],
        structured_context: dict[str, Any],
        rag_evidence: list[dict[str, Any]],
        question: str | None = None,
        enforce_grounding: bool = True,
    ) -> tuple[GroundedResponse, GroundingReport]:
        """Stage 2 — reason over current hazard + structured data + evidence.

        Returns the response and its grounding report. With
        `enforce_grounding=True` ungrounded claims are stripped and violations
        are surfaced as warnings; the response is never silently trusted.
        """
        prompt = build_evidence_reasoning_prompt(
            current_hazard, structured_context, rag_evidence, question
        )
        raw = self._infer(prompt, GroundedResponse.model_json_schema())
        payload = _parse_json_object(raw)
        try:
            response = GroundedResponse.model_validate(payload)
        except Exception as exc:
            raise LlmRuntimeError(f"Stage-2 output failed schema validation: {exc}") from exc

        validator = GroundingValidator(structured_context, rag_evidence)
        report = validator.validate(response)

        if enforce_grounding and not report.ok:
            response = _apply_grounding_enforcement(response, report)
        return response, report

    # -- runtime plumbing ----------------------------------------------------

    def _infer(self, prompt: str, response_schema: dict[str, Any] | None = None) -> str:
        if not self.config.is_configured:
            raise LlmNotConfigured(
                "LLM runtime not configured. Set AVASYA_LLM_RUNTIME=cli with "
                "AVASYA_LLM_CLI_PATH + AVASYA_LLM_MODEL_PATH (Qwen3-8B-Q4_K_M.gguf), "
                "AVASYA_LLM_RUNTIME=server with AVASYA_LLM_SERVER_URL, or "
                "AVASYA_LLM_RUNTIME=ollama with AVASYA_LLM_OLLAMA_MODEL."
            )
        if self.config.runtime == "server":
            return self._infer_server(prompt)
        if self.config.runtime == "ollama":
            return self._infer_ollama(prompt, response_schema)
        return self._infer_cli(prompt)

    def _infer_cli(self, prompt: str) -> str:
        try:
            cmd = self.config.cli_command(prompt)
        except LlmNotConfiguredError as exc:
            raise LlmNotConfigured(str(exc)) from exc
        try:
            completed = subprocess.run(
                cmd,
                input=prompt,
                capture_output=True,
                text=True,
                timeout=self.config.timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise LlmNotConfigured(f"llama-cli executable not found: {self.config.cli_path}") from exc
        except subprocess.TimeoutExpired as exc:
            raise LlmRuntimeError(f"llama-cli timed out after {self.config.timeout_seconds}s") from exc
        if completed.returncode != 0 and not completed.stdout.strip():
            raise LlmRuntimeError(
                f"llama-cli exited {completed.returncode}: {completed.stderr[-400:]}"
            )
        return completed.stdout

    def _infer_server(self, prompt: str) -> str:
        import urllib.error
        import urllib.request

        assert self.config.server_url is not None
        url = self.config.server_url.rstrip("/")
        if not url.endswith("/v1/chat/completions"):
            url = f"{url}/v1/chat/completions"
        body = json.dumps(
            {
                "messages": [{"role": "user", "content": prompt}],
                "temperature": self.config.temperature,
                "max_tokens": self.max_tokens_value(),
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self.config.timeout_seconds) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LlmRuntimeError(f"llama-server HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise LlmRuntimeError(f"llama-server unreachable: {exc}") from exc
        try:
            return payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LlmRuntimeError(f"llama-server returned an unexpected shape: {exc}") from exc

    def max_tokens_value(self) -> int:
        return self.config.max_tokens

    def _infer_ollama(self, prompt: str, response_schema: dict[str, Any] | None) -> str:
        """Ollama /api/generate with the response JSON schema as `format`.

        Teammate E's runtime (llama3.2:3b by default): passing the Pydantic
        JSON schema into Ollama's `format` field constrains sampling so the
        model cannot emit malformed JSON — the strongest grounding hook of
        the recovered module, adopted here for every runtime mode.
        """
        import urllib.error
        import urllib.request

        cfg = self.config
        base = (cfg.ollama_url or "http://localhost:11434").rstrip("/")
        body: dict[str, Any] = {
            "model": cfg.ollama_model or "llama3.2:3b",
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": cfg.temperature,
                "num_ctx": cfg.n_ctx,
                "num_predict": cfg.max_tokens,
            },
        }
        if response_schema is not None:
            body["format"] = response_schema
        request = urllib.request.Request(
            f"{base}/api/generate",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=cfg.timeout_seconds) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise LlmRuntimeError(f"Ollama HTTP {exc.code}") from exc
        except (urllib.error.URLError, TimeoutError) as exc:
            raise LlmNotConfigured(f"Could not connect to Ollama at {base}: {exc}") from exc
        if "error" in payload:
            raise LlmRuntimeError(f"Ollama inference failed: {payload['error']}")
        output = (payload.get("response") or "").strip()
        if not output:
            raise LlmRuntimeError("Ollama returned empty model output.")
        return output

    # ---------------------------------------------------------------------
    # Teammate compatibility API (recovered ai/llm module, LLMService.generate)
    # ---------------------------------------------------------------------

    def generate(self, payload: Any) -> Any:
        """`LLMInput` -> grounded single-stage inference -> `LLMResponse`.

        Implements the recovered teammate module's public surface: build the
        grounded prompt, run schema-constrained inference, validate strictly.
        Same honest-failure rules as `assess` — no silent malformed output.
        """
        from ai.llm.compat import LLMInput, LLMResponse
        from ai.llm.compat import build_grounded_context as _compat_ctx

        if isinstance(payload, dict):
            payload = LLMInput.model_validate(payload)
        grounded = _compat_ctx(payload)
        raw = self._infer(grounded["prompt"], LLMResponse.model_json_schema())
        parsed = _parse_json_object(raw)
        try:
            return LLMResponse.model_validate(parsed)
        except Exception as exc:
            raise LlmRuntimeError(f"Model output failed validation: {parsed!r}") from exc


# ---------------------------------------------------------------------------
# Qwen3 output parsing (spec section 34)
# ---------------------------------------------------------------------------

def _parse_json_object(raw: str) -> dict[str, Any]:
    """Extract the final JSON object from model stdout.

    Qwen3 may emit <think>...</think> blocks or reasoning prose before the
    answer, so raw stdout is scanned for balanced JSON objects from the last
    '{' that parses. Hidden reasoning is discarded, never surfaced.
    """
    text = raw or ""
    # strip Qwen3 thinking blocks if present
    if "</think>" in text:
        text = text.split("</think>", 1)[1]
    text = text.strip()

    candidates: list[str] = []
    depth = 0
    start = -1
    for index, char in enumerate(text):
        if char == "{":
            if depth == 0:
                start = index
            depth += 1
        elif char == "}" and depth:
            depth -= 1
            if depth == 0 and start >= 0:
                candidates.append(text[start : index + 1])
    for candidate in reversed(candidates):  # prefer the LAST complete object
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed

    # Truncation fallback: a schema-constrained model that hit the output
    # token cap mid-JSON leaves unbalanced braces. Repair by closing the
    # open structure and retry once — downstream schema validation still
    # rejects garbage, so this can only rescue genuinely truncated output.
    repaired = _repair_truncated_json(text)
    if repaired is not None:
        try:
            parsed = json.loads(repaired)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            return parsed
    raise LlmRuntimeError("No valid JSON object found in model output")


def _repair_truncated_json(text: str) -> str | None:
    """Close an unbalanced JSON object truncated by the output token cap.

    Tries the text as-is first (closing the open strings/structures), then
    progressively earlier comma cut points — the first candidate that parses
    wins. Returns None when nothing plausible exists.
    """
    start = text.find("{")
    if start < 0:
        return None
    comma_positions = [i for i, ch in enumerate(text) if ch == ","]
    candidates = [text[start:]]
    candidates.extend(text[start:pos] for pos in reversed(comma_positions))
    for candidate in candidates:
        repaired = _close_open_structure(candidate)
        if repaired is None:
            continue
        try:
            json.loads(repaired)
        except json.JSONDecodeError:
            continue
        return repaired
    return None


def _close_open_structure(body: str) -> str | None:
    """Append the missing closers for an unterminated JSON prefix.

    Returns None when the prefix is already balanced (nothing to repair).
    """
    stack: list[str] = []
    in_string = False
    escaped = False
    for char in body:
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char in "{[":
            stack.append(char)
        elif char in "}]" and stack:
            stack.pop()
    if not stack:
        return None  # already balanced; truncation repair does not apply
    if in_string:
        body += '"'
    return body + "".join("}" if opening == "{" else "]" for opening in reversed(stack))


def _apply_grounding_enforcement(
    response: GroundedResponse, report: GroundingReport
) -> GroundedResponse:
    """Drop ungrounded claims, keep the officer informed via warnings."""
    violation_fields = {v.split("'")[1] if "'" in v else "" for v in report.violations}
    kept_claims = [c for c in response.claims if c.field not in violation_fields]
    warnings = list(response.warnings) + [
        f"grounding violation removed: {v}" for v in report.violations
    ]
    return response.model_copy(update={"claims": kept_claims, "warnings": warnings})


# Shared instance for lightweight consumers (routes). Tests build their own
# LlmService with an injected config; this one reads the ambient environment.
llm_service_singleton = LlmService()


__all__ = [
    "GroundedResponse",
    "GroundingReport",
    "LlmNotConfigured",
    "LlmRuntimeError",
    "LlmService",
    "llm_service_singleton",
]
