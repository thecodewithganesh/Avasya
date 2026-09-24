"""LLM runtime configuration (teammate spec section 24).

Every machine-specific path arrives through environment variables — nothing
is hard-coded. With no configuration the module degrades to `LlmNotConfigured`
and callers must surface an honest "LLM unavailable" state (never a fabricated
explanation).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    return value if value not in (None, "") else default


@dataclass(frozen=True)
class LlmConfig:
    """Where and how the Qwen3 model is executed.

    Two runtimes are supported, selected by AVASYA_LLM_RUNTIME:

    - "cli"      : run `llama-cli.exe -m <model>` per request (teammate's
                   documented default; no server process needed).
    - "server"   : call a llama.cpp `llama-server` OpenAI-compatible HTTP
                   endpoint (faster for repeated demo queries).
    - "ollama"   : POST to a local Ollama server (`/api/generate`) with the
                   response JSON schema passed in `format`, forcing schema-
                   valid output at the sampler level (teammate E's runtime;
                   e.g. OLLAMA_MODEL=llama3.2:3b on localhost:11434).

    "cli"/"server" point at the Qwen3-8B GGUF; "ollama" delegates model
    management to the Ollama server.
    """

    runtime: str = "cli"                      # "cli" | "server" | "ollama"
    cli_path: str | None = None               # AVASYA_LLM_CLI_PATH
    model_path: str | None = None             # AVASYA_LLM_MODEL_PATH
    server_url: str | None = None             # AVASYA_LLM_SERVER_URL
    ollama_url: str | None = None             # AVASYA_LLM_OLLAMA_URL (default http://localhost:11434)
    ollama_model: str | None = None           # AVASYA_LLM_OLLAMA_MODEL (e.g. llama3.2:3b)
    n_ctx: int = 4096                         # AVASYA_LLM_N_CTX
    n_gpu_layers: int = -1                    # AVASYA_LLM_N_GPU_LAYERS (-1 = auto/offload max)
    timeout_seconds: float = 120.0            # AVASYA_LLM_TIMEOUT
    max_tokens: int = 700                     # AVASYA_LLM_MAX_TOKENS
    temperature: float = 0.1                  # AVASYA_LLM_TEMPERATURE (low = deterministic-ish)
    extra_cli_args: list[str] = field(default_factory=list)

    @property
    def is_configured(self) -> bool:
        if self.runtime == "server":
            return bool(self.server_url)
        if self.runtime == "ollama":
            return bool(self.ollama_model)  # URL defaults to localhost:11434
        return bool(self.cli_path and self.model_path)

    def cli_command(self, prompt: str) -> list[str]:
        """Build the llama-cli invocation. The prompt is passed via stdin."""
        if not self.cli_path or not self.model_path:
            raise LlmNotConfiguredError("AVASYA_LLM_CLI_PATH / AVASYA_LLM_MODEL_PATH not set")
        cmd: list[str] = [
            self.cli_path,
            "-m", self.model_path,
            "--no-display-prompt",
            "-n", str(self.max_tokens),
            "-c", str(self.n_ctx),
            "--temp", str(self.temperature),
        ]
        if self.n_gpu_layers != 0:
            cmd += ["-ngl", str(self.n_gpu_layers)]
        cmd += list(self.extra_cli_args)
        # prompt travels on stdin; the single "-" argument tells llama-cli to read it
        cmd.append("-p")
        cmd.append(prompt)
        return cmd

    @staticmethod
    def from_env() -> "LlmConfig":
        runtime = (_env("AVASYA_LLM_RUNTIME", "cli") or "cli").strip().lower()
        if runtime not in {"cli", "server", "ollama"}:
            runtime = "cli"
        extra = (_env("AVASYA_LLM_EXTRA_ARGS", "") or "").split()
        return LlmConfig(
            runtime=runtime,
            cli_path=_env("AVASYA_LLM_CLI_PATH"),
            model_path=_env("AVASYA_LLM_MODEL_PATH"),
            server_url=_env("AVASYA_LLM_SERVER_URL"),
            ollama_url=_env("AVASYA_LLM_OLLAMA_URL"),
            ollama_model=_env("AVASYA_LLM_OLLAMA_MODEL"),
            n_ctx=int(_env("AVASYA_LLM_N_CTX", "4096") or 4096),
            n_gpu_layers=int(_env("AVASYA_LLM_N_GPU_LAYERS", "-1") or -1),
            timeout_seconds=float(_env("AVASYA_LLM_TIMEOUT", "120") or 120),
            max_tokens=int(_env("AVASYA_LLM_MAX_TOKENS", "700") or 700),
            temperature=float(_env("AVASYA_LLM_TEMPERATURE", "0.1") or 0.1),
            extra_cli_args=extra,
        )


class LlmNotConfiguredError(RuntimeError):
    """Raised when inference is requested but no runtime is configured."""


llm_config = LlmConfig.from_env()
