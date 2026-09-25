# LLM Integration Guide (for the LLM module owner)

**Status: IMPLEMENTED — `ai/llm/` (Qwen3-8B Q4_K_M via llama.cpp) built to the
LLM teammate's architecture document and wired through the adapter.**
(`ai/llm/*`, `backend/integrations/llm_client.py`,
`backend/routes/intelligence.py` → `POST /api/v1/llm/explain`,
`POST /api/v1/llm/retrieval-plan`)

> Integration note (2026-09-17): the handoff folder `D:\downloads\backend`
> contained a stale copy of M's backend — the only real deliverable was the
> architecture document. Per the team contract the integration agent
> implemented `ai/llm/` **exactly to that document's spec** (two-stage
> prompts, Qwen3 output handling, grounding validation, env-configured
> llama.cpp). The LLM teammate can replace any file under `ai/llm/` without
> contract changes; tests in `ai/llm/tests/` + `tests/test_llm_api.py` lock
> the behaviour.

## Runtime configuration (env only — nothing hard-coded)

```powershell
# CLI runtime (default; teammate's documented llama-cli.exe path)
$env:AVASYA_LLM_RUNTIME="cli"
$env:AVASYA_LLM_CLI_PATH="C:\Users\Priya S\llama.cpp-new\llama-cli.exe"
$env:AVASYA_LLM_MODEL_PATH="C:\AI\Models\Qwen3-8B-Q4_K_M.gguf"

# OR HTTP runtime against llama-server
$env:AVASYA_LLM_RUNTIME="server"
$env:AVASYA_LLM_SERVER_URL="http://localhost:8080"

# optional: AVASYA_LLM_N_CTX, AVASYA_LLM_MAX_TOKENS, AVASYA_LLM_TEMPERATURE,
#           AVASYA_LLM_TIMEOUT, AVASYA_LLM_N_GPU_LAYERS, AVASYA_LLM_EXTRA_ARGS
```

Unconfigured → `503 {integration_pending: true}` — the system never
fabricates an explanation.

AVASYA does **not** implement a competing LLM. The LLM teammate's module
owns the model/agent. AVASYA owns the **authority boundary** and the
**claim validation layer**.

## The authority boundary (non-negotiable)

The LLM is **never authoritative** for:

population · risk score · risk level · capacity · coordinates · travel
distance · travel time · hazard status · destination eligibility ·
approval state.

Those come from AVASYA structured services. Every numeric/factual claim the
LLM makes is validated by `ClaimValidator`
(`backend/integrations/claim_validator.py`) and shown to the officer with a
VERIFIED / CONFLICT / UNSUPPORTED badge. See `19_LLM_CLAIM_VALIDATION.md`.

## Contract (Pydantic, enforced at the API boundary)

Request — `POST /api/v1/llm/explain`:

```json
{
  "question": "Why was Relief Center North recommended?",
  "avasya_context": {
    "habitation": {"name": "Krishnapuram Village", "population": 1240},
    "risk": {"score": 67.0, "level": "MEDIUM"},
    "hazard_status": "RED",
    "recommendation": {"destination": "Relief Center North", "distance_km": 3.258},
    "warnings": ["Vulnerability data is district-level…"]
  },
  "rag_evidence": [ { "chunk_id": "…", "text": "…", "source_id": "…", "score": 0.91 } ],
  "claims": []
}
```

`avasya_context` is structured AVASYA data (not prose); `rag_evidence` is
the output of `POST /api/v1/rag/query`.

Response:

```json
{
  "answer": "…officer-facing explanation…",
  "claims": [ { "field": "population", "value": 1240, "unit": "persons" } ],
  "citations": ["NDMA-GUIDELINES-2024"]
}
```

Every element of `claims` is auto-validated against AVASYA structured data
and returned with VERIFIED / CONFLICT / UNSUPPORTED status
(`POST /api/v1/habitations/{id}/claims/validate`).

## How to plug your module in (3 steps)

1. Place your package under `backend/integrations/llm_impl/`.
2. In `backend/integrations/llm_client.py`, replace `NotImplementedLlmClient`
   with an adapter that serializes `avasya_context` + `rag_evidence` into
   your prompt/input format and maps your output to
   `LlmResponse` (answer + claims + citations). Emit a `claims` entry for
   every operational number you state — unclaimed numbers will surface as
   UNSUPPORTED in review.
3. Restart the backend.

**Do not** change the response shape.

## Current behaviour before wiring

`POST /api/v1/llm/explain` returns **503** with
`{"integration_pending": true, …}` — an honest gap, never a fabricated
explanation.
