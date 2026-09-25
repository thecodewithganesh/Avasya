# 17 — LLM Architecture

**Module: `ai/llm/` — Qwen3-8B (llama.cpp) or llama3.2:3b (Ollama, teammate E's runtime) · adapter: `backend/integrations/llm_client.py` · LLM tests incl. `ai/llm/tests/test_compat.py` · guide: `LLM_INTEGRATION.md`**

## Two-stage grounded design (teammate E's architecture, implemented)

```
Stage 1 — GROUNDED DRAFT
   question + AVASYA structured facts + RAG evidence
   → draft answer (restricted context, no world knowledge invited)

Stage 2 — CLAIM STRIP + VALIDATE
   draft → structured claims extracted
   → each claim checked against structured DB values + evidence
   → only surviving claims returned as VERIFIED
   → CONFLICT / UNSUPPORTED claims flagged, not silently kept
```

## Ground rules (frozen)

1. The LLM **explains**; it never **decides**. Status, risk, capacity, priority are engine outputs.
2. The LLM is never authoritative for operational values — the claim validator strips any number that conflicts with the DB.
3. No official-endorsement language: outputs are recommendations with citations, never "the government says evacuate".
4. Runtime activation is pure config — **three interchangeable runtimes** selected by `AVASYA_LLM_RUNTIME`:
   - `ollama` — teammate E's runtime (default model `llama3.2:3b`): POST `/api/generate` with the response JSON schema passed as `format`, constraining sampling so the model cannot emit malformed JSON. Easiest trigger: `docker compose --profile ollama up -d` + `ollama pull llama3.2:3b`.
   - `server` — llama.cpp `llama-server` OpenAI endpoint (Qwen3-8B-Q4_K_M.gguf; `llm` compose profile).
   - `cli` — one `llama-cli` process per request, same GGUF.
   All three share the same schema-constrained inference path, grounding validation and honest failures. Absent config → extractive mode answers with citations. The teammate's single-stage API (`LLMInput`/`LLMResponse`, `LLMService.generate`) is preserved in `ai/llm/compat.py` for their tests and callers.
5. No custom-trained model. Qwen3-8B / llama3.2:3b instruct with constrained prompting — the honest answer to "did you build your own LLM?" is "no, and here's why that's the right call" (`29_LIMITATIONS.md`).

## Claim validation detail

See `19_LLM_CLAIM_VALIDATION.md` — the population 1,240 vs 1,500 → CONFLICT example is locked by tests (`tests/test_claim_validation.py`).
