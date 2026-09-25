# 24 — Testing & Validation

**Current verified state: 197/197 backend tests · frontend `tsc` + `eslint` + production build clean · live Docker stack exercised**

## Backend suite

```bash
python -m pytest tests/ ai/ backend/ -q        # 197 tests
python -m compileall -q backend ai gis         # syntax gate
```

| Suite | Covers |
|---|---|
| `tests/test_one_id_trace.py` | **THE cross-layer test:** one habitation id through hazard→risk→priority→capacity→destination→transport→RAG→claims→approval |
| `tests/test_rag.py` | chunk→embed→index→retrieve→generate, both modes, honest 503 |
| `tests/test_claim_validation.py` | VERIFIED / CONFLICT / UNSUPPORTED incl. population 1,240-vs-1,500 CONFLICT |
| `tests/test_supabase_auth.py` | valid/tampered/expired JWT, unconfigured secret, demo-header regression |
| `tests/test_hazard_status.py` | 4-state engine, DATA_UNAVAILABLE ≠ NO_ALERT |
| `tests/test_response_time.py` | computed response window + urgency classes |
| `tests/test_transport.py` | eligible-only routing, hazard-aware pathing |
| ingestion suites | schema/ID/provenance enforcement (23 tests) |
| `ai/` engine tests (34) | risk / priority / capacity / suitability / recommendation |
| `tests/test_api_contract.py` | frozen response vocabulary |

## Frontend checks

```bash
cd frontend && npx tsc --noEmit && npx eslint .
npm run build                                  # production build gate
```

## Live / E2E

- `scripts/run_mvp_checks.cmd` — validates the running stack's API surface (health, decisions, RAG chain, explain)
- `docker compose up --build` — full-stack bootstrap incl. pgvector + auto-index (13 chunks on demo corpus)
- CI: `.github/workflows` mirrors the same commands

## The demo kill-switch drills

Run the P0 chain with: (1) empty RAG corpus, (2) LLM runtime absent, (3) a missing dataset — each must degrade honestly (`Evidence unavailable` / extractive mode / `DATA_UNAVAILABLE`), never fabricate.
