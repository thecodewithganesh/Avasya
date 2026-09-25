# 20 — API Specification

**Source of truth:** OpenAPI at `http://localhost:58000/docs` (live). Below, the frozen surfaces every teammate codes against.

## Conventions

- Base: `http://localhost:58000/api/v1`
- Auth: `Authorization: Bearer <Supabase JWT>` when configured, else demo `X-Officer-Email` header
- Errors: problem-shaped JSON; **503 `integration_pending`** never lies — it means "not configured", with setup instructions

## Decision chain (P0)

| Method & path | Purpose |
|---|---|
| `GET /habitations` | map points: id, population, status, coordinates |
| `GET /habitations/{id}` | one-click detail: population, hazard, status, coords, evidence, timestamp, risk, priority |
| `GET /habitations/{id}/risk` | risk 0–100 + band |
| `GET /relocation-priorities` | ranked IMMEDIATE…MONITOR list |
| `GET /destinations?habitation_id=` | capacity verdict per destination (ELIGIBLE/INSUFFICIENT) |
| `POST /transport/route` | route + travel time, eligible destinations only |
| `GET /recommendations/{id}` | final recommendation with capacity gate applied |

## Evidence & AI (P1)

| Method & path | Purpose |
|---|---|
| `POST /api/v1/rag/index` | rebuild pgvector corpus (idempotent) |
| `POST /api/v1/rag/query` | retrieval → `RagQueryResponse` (grounding_status, EVD- ids, provenance) |
| `POST /api/v1/rag/answer` | retrieve + generate → `{answer, mode, grounding_status, chunks_used, warnings}` |
| `POST /evidence/search` | semantic-first, keyword fallback; reports `retrievalMethod` |
| `POST /habitations/{id}/explain` | grounded explanation; `retrievalMode` says which engine wrote it |

## Ops

| Method & path | Purpose |
|---|---|
| `GET /health` | liveness (`{"status":"ok"}`) |
| `GET /docs` | OpenAPI UI |
| `POST /approvals` | officer approval/override → audit |

## Frozen response vocabulary

`grounding_status: SUPPORTED\|UNSUPPORTED` · `mode: llm\|extractive` · `claim_status: VERIFIED\|CONFLICT\|UNSUPPORTED` · `data_origin: REAL\|SYNTHETIC_DEMO` · `hazard_status: RED\|YELLOW\|NO_ALERT\|DATA_UNAVAILABLE` · `priority: IMMEDIATE\|SHORT_TERM\|MEDIUM_TERM\|MONITOR`

Any change to these strings is a contract change → update `backend/integrations/contracts.py`, the frontend types, **and this doc** in the same PR.
