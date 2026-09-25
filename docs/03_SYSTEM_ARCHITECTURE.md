# 03 — System Architecture

**Companion:** `TECHNICAL_IMPLEMENTATION.md` (deep dive), `INTEGRATIONS.md` (integration matrix)

## The eight layers (and how they talk)

```
OFFICIAL DATA (data/raw/, ingestion/)
        │
┌───────┴────────┐
↓                ↓
GIS / HAZARD      DOCUMENTS (NDMA / SDMA / IMD)
↓                ↓
STATUS ENGINE      RAG (chunk→embed→index→retrieve)
RED/YELLOW/GREEN    ↓
DATA_UNAVAILABLE   EVIDENCE
↓                │
HABITATION ←──────┤
↓                │
RISK (0–100)      │
↓                │
RESPONSE WINDOW ←──┤
↓                ↓
TRANSPORT → CAPACITY GATE → RECOMMENDATION
                                  │
                    LLM (grounded) + CLAIM VALIDATION
                                  ↓
                       OFFICER APPROVAL → AUDIT
```

**Golden rule:** the decision chain (left branch) never depends on the AI branch (right branch). If RAG/LLM are down, the officer still gets status → risk → capacity → recommendation → approval, and the UI honestly says the AI part is unavailable.

## Components

| Component | Tech | Talks to |
|---|---|---|
| `frontend/` | Next.js 15, MapLibre GL | FastAPI only (never the DB) |
| `backend/routes/` | FastAPI | services |
| `backend/services/` | 8 decision engines | `ai/`, `backend/transportation/`, `backend/rag/` |
| `ai/` | risk / priority / capacity / suitability / recommendation / llm engines | pure functions over DB rows |
| `backend/integrations/` | rag_client, llm_client, claim_validator, supabase, contracts | external systems |
| `backend/rag/` | chunker → E5 → pgvector indexer → retriever → generator | Postgres (pgvector) |
| `backend/ingestion/` | dataset loaders with provenance | Postgres (PostGIS) |
| Postgres | PostGIS 16 + pgvector, HNSW index | everything server-side |
| Docker | compose: db, backend, frontend, rag-index (+ llm, dbadmin profiles) | — |

## Contract discipline

- **One ID everywhere:** `habitation_id` (e.g. `H001`) is the join key across GIS, risk, relocation, destination, transport, RAG context, frontend. Enforced by `tests/test_one_id_trace.py`.
- Frozen response contracts in `backend/integrations/contracts.py` (`RagQueryResponse`: `grounding_status`, `EVD-` ids, provenance). Frontend `lib/evidence-api.ts` consumes exactly these.
- Status vocabulary frozen: `RED / YELLOW / NO_ALERT / DATA_UNAVAILABLE` and `REAL / SYNTHETIC_DEMO`. `DATA_UNAVAILABLE ≠ NO_ALERT` — a judge question we answer in the UI, not in a slide.
