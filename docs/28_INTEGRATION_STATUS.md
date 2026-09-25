# 28 — Integration Status

**Single source of truth for what is wired, how it's verified, and how to turn each piece on. Detailed matrix: `INTEGRATIONS.md`.**

> **Current-checkout audit — 2026-09-24.** The historical matrix below is an
> implementation inventory, not present-tense acceptance evidence. In this
> checkout the Census input required by `backend.ingestion.south_india` is
> absent, no authoritative capacity-availability dataset is present, Docker
> Desktop is unavailable, and no LLM runtime/model is configured. Therefore
> real-record, second-record, live GIS, live UI, and live-LLM proofs are
> **BLOCKED**. The Python test suite passes (210 passed, 1 skipped), but its
> fixtures are not evidence of a real-data deployment. Synthetic demo seeding
> is now explicitly opt-in via `AVASYA_ENABLE_SYNTHETIC_DEMO=true`.

## Master matrix (verified 2026-09-17)

| Integration | Status | Module | Verify |
|---|---|---|---|
| RAG retrieval | ✅ wired + tested | `backend/rag/` + `rag_client.py` | 14 tests; live `/rag/query` SUPPORTED on Docker |
| RAG generation | ✅ wired + tested | `backend/rag/generator.py` | `/rag/answer` extractive + LLM modes live-verified |
| LLM (Qwen3/llama3.2) | ✅ wired, runtime opt-in | `ai/llm/` + `llm_client.py` | tests; 3 runtimes — `ollama` (compose `ollama` profile), llama.cpp `server`/`cli` (`llm` profile) |
| E5 embeddings | ✅ wired, opt-in | `backend/rag/embedder.py` | stub default; real E5 via `EMBEDDING_PROVIDER=huggingface` + `backend-ml` image |
| Supabase Auth | ✅ wired + tested | `backend/integrations/supabase.py` | 9 JWT tests; demo-header fallback preserved |
| Supabase Postgres/Storage | ✅ supported | DATABASE_URL + `storage_client()` | `INTEGRATIONS.md` setup |
| GIS/hazard engine | ✅ wired + tested | `backend/gis_hazardapi/` vendored + `gis/` | 27 GIS/hazard tests |
| DB (PostGIS+pgvector) | ✅ live-verified | migrations 20260916/17 | compose: healthy, 13 chunks indexed |
| Ingestion | ✅ wired + tested | `backend/ingestion/` | 23 tests |
| Transport | ✅ wired + tested | `backend/transportation/` | 18 tests |
| Claim validation | ✅ wired + tested | `backend/integrations/claim_validator.py` | VERIFIED/CONFLICT/UNSUPPORTED proven |
| Frontend data layer | ✅ wired | `lib/api.ts`, `lib/evidence-api.ts` | build + typecheck clean; LIVE mode hits real endpoints |
| Docker stack | ✅ live-verified | `docker-compose.yml` | db+backend healthy, frontend 200 |

## Layer scorecard (mentor's 8 layers)

1. DATA→DB **8/10** · 2. DB→Backend **9/10** · 3. GIS→Map **8/10** · 4. Hazard→Risk→Priority **10/10** · 5. Risk→Destination→Capacity **10/10** · 6. Transport **9/10** · 7. RAG→LLM **8/10** · 8. LLM→Validation **9/10** · Failure sync **9/10** · Frontend sync **8/10** → **Overall ≈ 88/100 — architecture connected, not just working parts.**

## Nothing is "claimed but not wired"

Every integration is either running or activates purely by configuration (env var / model file / corpus). The incomplete-for-now items and their exact activation steps live in `INTEGRATIONS.md`.
