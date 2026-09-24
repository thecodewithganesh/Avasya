# 19 — LLM Claim Validation

**Module: `backend/integrations/claim_validator.py` · tests: `tests/test_claim_validation.py`, `tests/test_api_contract.py` · guide: `LLM_VALIDATION.md`**

## The feature that proves the LLM isn't blindly trusted

```
AVASYA structured values (DB)          LLM answer text
   population = 1,240                     "...approximately 1,500 people..."
              ↓                                ↓
              └────────→ validator ←───────────┘
                            ↓
        VERIFIED (matches DB/evidence)
        CONFLICT  (contradicts a structured value → stripped + flagged)
        UNSUPPORTED (no backing source → flagged, not presented as fact)
```

## Verified example (locked by tests)

- Expected: population **1,240** · LLM says **1,500** → ❌ **CONFLICT** — surfaced, never silently shown.
- LLM says **1,240** → ✅ **VERIFIED**.
- Claim with no source → ⚠ **UNSUPPORTED**.

## Scope

Simple structured comparison + evidence checking — deliberately *not* an ML verification model. Numeric claims are compared against authoritative DB fields and RAG evidence; textual claims need a citation to survive. This is enough for MVP and far more defensible than a validator nobody can explain.

## Where it runs

Stage 2 of `ai/llm/` (claim strip) plus a final API-layer pass in `backend/integrations/` — badges rendered next to the explanation in the CoPilot panel and explain views.
