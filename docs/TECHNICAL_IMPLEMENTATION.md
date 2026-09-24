# AVASYA — Technical Implementation Guide

**Version:** 1.0 (MVP freeze candidate)
**Scope:** what is actually implemented, where it lives, how it works, how it is tested.
**Companion docs:** `docs/INTEGRATIONS.md` (integration matrix), `docs/RAG_INTEGRATION.md`, `docs/LLM_INTEGRATION.md`, `docs/25_E2E_DEMO_SCENARIO.md`.

Verified state at time of writing: **197/197 backend tests**, `python -m compileall backend ai gis` clean, frontend **production build succeeds** (`next build`), TypeScript + ESLint clean.

---

## 1. System overview

AVASYA is a disaster decision-support platform: it identifies an affected
habitation, determines hazard status and risk, calculates the available
response window, checks safe transportation and destination capacity, and
provides RAG-grounded, claim-validated AI explanation for the officer.

```
OFFICIAL DATA
     │
 ┌───┴──────────────┐
 ▼                  ▼
GIS / Hazard      Documents (NDMA etc.)
 │                  │
 ▼                  ▼
Historical/Current   RAG (E5 + pgvector)
 │                  │
 ▼                  ▼
RED/YELLOW/GREEN   Evidence
DATA_UNAVAILABLE      │
 │                  ▼
 ▼                  LLM (Qwen3) ──► Claim Validation
HABITATION ────────►   │
 ▼                     ▼
RISK               Explanation
 ▼
RESPONSE WINDOW
 ▼
TRANSPORT / ROUTE (capacity-eligible only)
 ▼
DESTINATION → CAPACITY → RECOMMENDATION
 ▼
OFFICER APPROVAL (audit)
```

**Golden rule:** the LLM is never authoritative for operational values
(population, risk, capacity, coordinates, travel time, hazard status,
eligibility, approval state). Every numeric claim the LLM makes is validated
against structured AVASYA data. Missing data is `DATA_UNAVAILABLE` /
`INSUFFICIENT_EVIDENCE`, never fabricated.

---

## 2. Technology stack

| Layer | Technology | Why |
|---|---|---|
| API | FastAPI 0.115 (Python 3.13/3.14) | async-friendly, typed contracts, OpenAPI docs |
| ORM / DB | SQLAlchemy 2.0 + Alembic 1.13 | typed models, migrations |
| Database | PostgreSQL 16 + PostGIS 3.4 + pgvector (HNSW) | spatial + vector retrieval in one engine |
| Transport | pgRouting-style graph + GeoAlchemy2 | real road networks, not straight-line |
| GIS | Shapely 2 / pyproj / pyogrio | geometry cleaning, CRS transforms |
| RAG | sentence-transformers `intfloat/multilingual-e5-small` (384-dim) | multilingual retrieval, E5 passage/query prefixes |
| LLM | Qwen3-8B-Q4_K_M via llama.cpp (CLI or OpenAI-compatible server) | local, no cloud dependency |
| Auth | Supabase Auth JWT (HS256) via PyJWT, demo header fallback | real identity without blocking MVP |
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | typed UI, server components |
| Maps | MapLibre GL | GPU vector rendering (Leaflet rejected: poor spatial performance/quality) |
| CI | GitHub Actions: pytest + compileall + next build | every push verified |

---

## 3. Repository layout (what each directory actually does)

```
Avasya/
├── ai/                          # Decision engines (pure functions, no DB)
│   ├── capacity/                #   usable-capacity waterfall
│   ├── priority/                #   relocation priority classification
│   ├── recommendation/          #   destination choice + what-if
│   ├── risk/                    #   risk score/level
│   ├── suitability/             #   destination scoring
│   ├── llm/                     #   Qwen3 2-stage grounded service
│   ├── config/weights.py        #   model weights (single tuning surface)
│   ├── explainability/          #   explanation builder
│   └── pipeline.py              #   run_decision(): the one entry point
├── backend/
│   ├── core/                    #   settings, DB session factory
│   ├── models/                  #   12 SQLAlchemy tables (incl. DocumentChunk)
│   ├── schemas/                 #   Pydantic API contracts
│   ├── routes/                  #   api, evidence, intelligence, gis, rag_admin
│   ├── services/                #   hazard_status, response_time, transport,
│   │                            #   pipeline, alerts, decision, geometry_utils
│   ├── integrations/            #   rag_client, llm_client, supabase,
│   │                            #   claim_validator, contracts (typed borders)
│   ├── rag/                     #   chunker → embedder → indexer → retriever → generator
│   ├── gis_hazardapi/           #   vendored GIS hazard engine + adapter
│   ├── ingestion/               #   dataset → DB with provenance stamps
│   ├── transportation/          #   road-graph transport module
│   ├── bootstrap_demo.py        #   SYNTHETIC_DEMO fixtures
│   └── seed_demo.py             #   demo world seeding
├── database/migrations/         #   Alembic: PostGIS schema + pgvector/HNSW
├── frontend/
│   ├── app/                     #   App Router pages (login, map, decisions…)
│   ├── components/              #   map (MapLibre), rag/, ui/, dashboards
│   ├── lib/                     #   api.ts (dual-mode), evidence-api.ts,
│   │                            #   supabase.ts, api-base.ts
│   └── types/                   #   api.ts, rag.ts view models
├── gis/                         # 5-stage spatial pipeline (preprocess → validate)
├── tests/                       # 197 tests incl. test_one_id_trace.py
├── data/raw/                    # 8 real datasets (coastline, roads, hazards…)
├── docs/                        # 13 docs incl. INTEGRATIONS.md matrix
└── infrastructure/Dockerfile.db # PostGIS + pgvector image
```

---

## 4. Database schema (12 tables)

| Table | Purpose | Key columns |
|---|---|---|
| `users` | officers + roles | email (unique), role (`officer`/`admin`), data_origin |
| `habitations` | the canonical entity | name, district, state, lat/lon, `geom POINT(4326)`, population, households |
| `hazards` | hazard events | hazard_type, severity_score, probability_score, `geom` |
| `habitation_hazards` | exposure link table | habitation_id ↔ hazard_id |
| `evidence` | provenance-bearing records | source_name, source_type, source_url, evidence_type, summary, `evidence_payload JSON`, data_origin |
| `risk_assessments` | per-habitation risk | score, level, factors JSON, generated_at |
| `relocation_priorities` | priority ranking | priority_score, priority_label, rationale |
| `destinations` | shelters | capacity_total, capacity_available, risk_score, geom |
| `capacity_assessments` | capacity waterfall | nominal, occupancy, water/sanitation constraints, safety_reserve, required, usable, gap, status |
| `recommendations` | engine output | summary, type, confidence, destination_id |
| `recommendation_approvals` | officer audit | action (APPROVE/OVERRIDE), override_note, officer, final_destination_id |
| `document_chunks` | RAG corpus | text, `embedding vector(384)`, habitation_id, evidence_type, unique (source_table, source_id, chunk_index), HNSW cosine index |

**Migrations:** `20260916_000001_initial_schema` (PostGIS, enum `data_origin`,
all tables) → `20260917_000001_rag_document_chunks` (pgvector extension,
`document_chunks`, HNSW `vector_cosine_ops` index).

**Data provenance (non-negotiable):** every row carries `data_origin ∈
{REAL, MIXED, SYNTHETIC_DEMO}` enforced at the DB level. Demo seeding always
stamps `SYNTHETIC_DEMO`; real ingestion stamps `REAL`.

---

## 5. The decision engines (`ai/`)

All engines are **pure functions**: no DB, no HTTP, fully deterministic and
unit-testable. `ai/pipeline.py::run_decision(evidence, destinations)` is the
single orchestration entry point.

**Risk** (`ai/risk/risk_engine.py`): weighted factor model → score 0–100 +
level LOW/MEDIUM/HIGH. Weights live in `ai/config/weights.py` (one tuning
surface, versioned).

**Priority** (`ai/priority/priority_engine.py`): risk + population exposure →
priority score + label IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR.

**Capacity** (`ai/capacity/capacity_engine.py`): the waterfall —

```
usable = nominal − existing_occupancy − water_constraint
                 − sanitation_constraint − safety_reserve
capacity_sufficient = usable >= required_population
```

**Recommendation** (`ai/recommendation/recommendation_engine.py`): iterates
destinations, enforces the capacity gate (INSUFFICIENT is excluded, never
"looks nearby, recommend"), scores suitability, returns ranked choice +
explanation. `what_if_unavailable()` re-runs with a destination excluded —
the what-if feature is a parameter, not a separate code path.

**Hazard status** (`backend/services/hazard_status.py`): RED / YELLOW /
NO_ALERT / **DATA_UNAVAILABLE** per hazard per habitation from evidence
freshness (staleness limit hours) + severity/probability thresholds. Key
rule: stale or missing evidence → `DATA_UNAVAILABLE`, **never** `NO_ALERT`.

**Response time** (`backend/services/response_time.py`): hazard status +
evidence timing + travel time + destination readiness → urgency + response
window. This is the "how long do we have to act" engine — the window is
*computed*, never a hardcoded "5 hours before".

**Transport** (`backend/services/transport.py` + `transportation/`): builds a
road graph, ranks routes by distance/time, **constrains candidates to
capacity-ELIGIBLE destinations**, flags high-hazard segments, returns
recommended route + alternatives with usable-vs-required check.

---

## 6. GIS pipeline (`gis/` + `backend/gis_hazardapi/`)

Five stages, each independently runnable:
`preprocessing` (geometry cleaning, CRS normalization to EPSG:4326) →
`feature-generation` → `spatial-analysis` (exposure) → `validation` →
hand-off to `backend/gis_hazardapi/engine.py` (vendored teammate engine:
spatial intersection + temporal analysis). The adapter
(`backend/gis_hazardapi/adapter.py::assess_records`) shapes its output for
`backend/routes/gis.py` (`/gis/hazard-zones`, `/gis/traffic-risk`,
`/gis/hazardapi/assess`).

**Geographic scope (MVP):** South-Indian coastal districts. The coastal
analysis zone is defined by the dataset coastline, not a visual buffer;
habitations outside the zone are out of MVP scope. Scaling path:
`docs/30_FUTURE_SCALING_PLAN.md` + Phase plan in `docs/INTEGRATIONS.md`.

---

## 7. RAG subsystem (`backend/rag/`)

Full pipeline: **chunk → embed → index → retrieve → generate**.

1. **Chunker** (`chunker.py`): evidence rows → narrative text (summary,
   evidence_type, source fields, payload narrative keys) → ≤1500-char
   paragraphs, min 20 chars. Pure function.
2. **Embedder** (`embedder.py`): `Embedder` protocol; `HuggingFaceEmbedder`
   (E5 `multilingual-e5-small`, 384-dim, `"passage: "`/`"query: "` prefixes,
   L2-normalized, batched, thread-safe) and `NullEmbedder` (zero vectors —
   default, keeps stack bootable without ML deps). Provider via
   `EMBEDDING_PROVIDER=null|huggingface`.
3. **Indexer** (`indexer.py`): batched embed → upsert keyed
   `(source_table, source_id, chunk_index)`; unchanged skipped, changed
   updated, stale removed. Idempotent; errors per-row never abort the run.
4. **Retriever** (`retriever.py`): pgvector `<=>` cosine distance ordered,
   [0,2] → [0,1] similarity mapping, optional habitation/evidence_type
   filters; HNSW-indexed on Postgres; Python-cosine fallback mirrors the SQL
   path on the SQLite test stack.
5. **Generator** (`generator.py`): retrieval → officer-facing answer.
   - **LLM mode** (Qwen3 configured): chunks feed the grounding validator
     chain; AI-written answer + citations.
   - **Extractive mode** (default): answer composed strictly from the top-3
     retrieved chunk texts with `[n]` citations — nothing invented.
   - No matches → `UNSUPPORTED`, "no answer can be grounded".

**APIs:** `POST /api/v1/rag/index` (idempotent rebuild),
`POST /api/v1/rag/query` (ranked chunks), `POST /api/v1/rag/answer`
(full pipeline). `/evidence/search` prefers semantic retrieval and
transparently falls back to keyword; `retrievalMethod` states which ran.

**Knowledge-base wording:** RAG is *indexed* from authoritative documents
(NDMA etc.), not "trained". Retrieved evidence grounds the LLM; it never
produces risk numbers.

---

## 8. LLM integration (`ai/llm/` + `backend/integrations/llm_client.py`)

Two-stage grounded design:

- **Stage 1** (`/llm/retrieval-plan`): hazard event → retrieval plan
  (`RetrievalPlan` schema).
- **Stage 2** (`/llm/explain`): question + structured AVASYA context + RAG
  evidence → JSON (`GroundedResponse`) → schema validation → **grounding
  validator** (every claim must cite `structured_context` or `rag` with a
  real source id) → violating claims **stripped**, surfaced as warnings.

Runtime: llama.cpp — `AVASYA_LLM_RUNTIME=cli` (per-call `llama-cli`) or
`server` (OpenAI-compatible HTTP). Qwen3 `<think>` blocks are parsed out;
only final JSON is trusted. Unconfigured → honest 503 `integration_pending`.

**Claim validation** (`backend/integrations/claim_validator.py`,
`POST /habitations/{id}/claims/validate`): LLM claims vs structured facts →
`VERIFIED` / `CONFLICT` / `UNSUPPORTED` + summary counts. Example locked by
tests: population 1,240 stated as 1,500 → CONFLICT.

---

## 9. Auth & Supabase (`backend/integrations/supabase.py`)

Priority order in the `_officer` dependency:

1. `Authorization: Bearer <jwt>` **and Supabase configured**
   (`SUPABASE_URL` + `SUPABASE_JWT_SECRET`): HS256 verify (signature,
   `aud=authenticated`, expiry) → resolve/create `users` row → existing
   role check (`officer`/`admin`). Invalid/expired token → **401, never a
   silent fallback**. Unknown email → auto-provisioned role-less → 401
   until an admin grants officer.
2. `X-Officer-Email` demo mechanism (unchanged; local demos).

Supabase Postgres: point `DATABASE_URL` at the Supabase pooler, enable
`postgis` + `vector` extensions, `alembic upgrade head`. Storage helper:
`storage_client()` (service-role key, backend only). Frontend:
`lib/supabase.ts` (env-gated, anon key only) → `lib/api.ts` attaches
`Authorization: Bearer` when a session exists. Secrets never committed,
never logged.

---

## 10. Frontend (`frontend/`)

Dual-mode data layer: `MOCK` (labelled SYNTHETIC_DEMO corpus) vs `LIVE`
(real API) selected by `NEXT_PUBLIC_USE_MOCK_DATA`. Server-side fetches
resolve the backend via `SERVER_SIDE_API_URL` (compose hostname); browser
uses `NEXT_PUBLIC_API_URL`.

- **Map:** MapLibre GL vector rendering — hazard zones, habitation markers,
  current + historical layers; habitation click → full dossier.
- **Evidence Explorer** (`components/rag/`): semantic search over the corpus.
- **CoPilot drawer:** evidence-grounded officer assistant — answers only
  from persisted assessment + retrieval, citations attached, honest error
  states (`retrieval-failed`, `llm-unavailable`). Not a generic chatbot:
  AI lives inside the emergency workflow.
- **Decision screens:** risk, priority, destination comparison, capacity
  check, transport, what-if, approval with override note + audit trail.
- **Honest states everywhere:** `INSUFFICIENT_EVIDENCE`,
  `DATA_UNAVAILABLE`, `SYNTHETIC_DEMO` badges — never fabricated rows.

Build verified: `next build` compiles all routes (static + dynamic),
`tsc --noEmit` and `eslint` clean.

---

## 11. Testing & verification (how to prove it works)

| Command | Verifies |
|---|---|
| `python -m pytest tests/ ai/ backend/ -q` | 197 tests across every layer |
| `python -m pytest tests/test_one_id_trace.py -s` | THE ONE-ID trace: one habitation through hazard→status→risk→priority→capacity→transport→RAG→claims→approval |
| `python -m pytest tests/test_rag.py -q` | chunk/index/retrieve/generate + adapter contract |
| `python -m pytest tests/test_supabase_auth.py -q` | JWT verify, tamper/expiry/audience rejection, fallback regression |
| `python -m compileall -q backend ai gis` | every module compiles |
| `cd frontend && npx tsc --noEmit && npm run build` | types + production build |
| `scripts/run_mvp_checks.cmd` | live-stack validation of every API incl. RAG index/query/answer |
| `docker compose up --build` | full stack: PostGIS+pgvector DB, auto-migrate, auto-ingest, auto-index, backend, frontend |

Test stack design: in-memory SQLite with Geometry→Text flattening and a
Python-cosine RAG fallback (production always runs PostGIS/pgvector via
Alembic) — deterministic, no services needed.

---

## 12. Failure semantics (graceful degradation)

| Failure | Behaviour |
|---|---|
| RAG corpus empty | `/rag/query` & `/rag/answer` → 503 `integration_pending`; `/evidence/search` falls back to keyword |
| Embedder/model missing | indexing → honest 503; retrieval → keyword fallback |
| LLM unconfigured | `/llm/explain` → 503; generator → extractive cited answer; core decision chain unaffected |
| LLM claim conflicts | claim stripped + warning; officer sees verified values |
| Evidence stale/missing | `DATA_UNAVAILABLE` (never `NO_ALERT`, never zeros) |
| DB down | 503 `Database unavailable` via exception handler |
| No eligible destination | pipeline completes; surfaces "no eligible destination" cleanly (tested) |

---

## 13. Performance & scale notes

- HNSW cosine index keeps retrieval sublinear as the corpus grows.
- Habitation list enrichment is O(n) parallel GET pairs — fine at demo scale
  (≤50 rows), documented to move server-side at census scale (96k).
- Transport graph is per-request in-memory; caching layer documented as
  future work (`docs/30_FUTURE_SCALING_PLAN.md`: vector tiles via pg_tileserv/Martin).
- Embedding batches (default 50/index call) sized for CPU inference.

---

## 14. What is intentionally NOT in the MVP

Prediction claims (e.g., "lightning 5h in advance"), nationwide coverage,
multi-hazard depth beyond flood, hybrid retrieval, custom-trained LLM,
real-time streams — all documented as future phases (`docs/30_FUTURE_SCALING_PLAN.md`,
`docs/INTEGRATIONS.md`). Nothing available is faked; unavailable states are
first-class UI citizens.
