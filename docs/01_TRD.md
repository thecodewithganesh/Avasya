# 01 — Technical Requirements Document

**Status:** frozen for MVP · **Verified against:** 197/197 tests, Docker stack live · **Date:** 2026-09-17

## 1. Purpose

AVASYA is a hazard-intelligence and relocation decision-support system for district disaster-management officers. It turns official hazard data into an explainable, auditable relocation recommendation — never an autonomous action.

## 2. Functional requirements (MVP, frozen)

| # | Requirement | Where implemented | Verified by |
|---|---|---|---|
| FR-1 | Ingest official-format datasets (habitations, hazards, destinations, roads) with provenance labelling | `backend/ingestion/` | 23 ingestion tests |
| FR-2 | Store geospatial data in PostGIS; retrieve evidence semantically via pgvector | `database/migrations/`, `backend/models/` | Alembic verified on live Postgres (compose) |
| FR-3 | Compute hazard status RED / YELLOW / NO_ALERT / DATA_UNAVAILABLE per habitation | `backend/services/hazard_status.py` | `tests/test_hazard_status.py` |
| FR-4 | Compute risk 0–100 from hazard severity × exposure | `ai/risk/` | 34 engine tests |
| FM-5 | Rank habitations into relocation priorities (IMMEDIATE / SHORT_TERM / MEDIUM_TERM / MONITOR) | `ai/priority/` + `backend/services/response_time.py` | trace test |
| FR-6 | Gate destinations on **usable** capacity (nominal − occupancy − constraints − safety reserve) | `ai/capacity/`, `ai/recommendation/` | `tests/test_one_id_trace.py` |
| FR-7 | Capacity-constrained transport: only capacity-eligible destinations are routed | `backend/transportation/`, `backend/services/transport.py` | 18 transport tests |
| FR-8 | Retrieval over official documents (RAG) with honest UNSUPPORTED when nothing matches | `backend/rag/` | 14 RAG tests |
| FR-9 | Grounded LLM explanation with claim stripping; extractive fallback | `ai/llm/`, `backend/rag/generator.py` | generator tests |
| FR-10 | Numeric claim validation VERIFIED / CONFLICT / UNSUPPORTED vs structured DB values | `backend/integrations/claim_validator.py` | `tests/test_claim_validation.py` |
| FR-11 | Officer approval + override recorded immutably in audit | `backend/models/` + routes | trace test |
| FR-12 | Optional Supabase JWT auth; demo header fallback when unconfigured | `backend/integrations/supabase.py` | 9 auth tests |
| FR-13 | One-command full stack | `docker-compose.yml` | live-verified |

## 3. Non-functional requirements

| NFR | Requirement | Status |
|---|---|→ see 26_DEPLOYMENT.md|
| NFR-1 | **Never fabricate:** any unavailable value returns `DATA_UNAVAILABLE` / `SYNTHETIC_DEMO` labels, never a guess | enforced at DB level (`data_origin`), claim validator, RAG `UNSUPPORTED` |
| NFR-2 | LLM never authoritative for operational values (population, capacity, status) | claim validator + contract tests |
| NFR-3 | Degradation: RAG/LLM down → core decision chain unaffected (map→risk→capacity→recommendation→approval) | trace test with empty corpus / no LLM |
| NFR-4 | Reproducible: one command (`docker compose up --build`) brings the full stack | live-verified |
| NFR-5 | Testable headless: 197 backend tests on SQLite-mirrored schema; live Postgres verified on compose | CI (.github/workflows) |
| NFR-6 | Secrets backend-only: JWT secret & service-role key never reach the frontend | auth tests + `lib/supabase.ts` |

## 4. Out of scope for MVP (defensible boundary)

Prediction beyond short-horizon official forecasts, multi-state coverage, custom-trained LLMs, real-time sensor streams — see `30_FUTURE_SCALING_PLAN.md`.

## 5. Acceptance criteria

The 15-step E2E scenario in `25_E2E_DEMO_SCENARIO.md` must pass end to end; the ONE-ID trace test must keep passing; no fabricated value may appear in any API response.
