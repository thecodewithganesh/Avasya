# 25 — E2E Demo Scenario

**Migrated from `E2E_DEMO.md` (LIVE-VERIFIED on Docker: PostGIS 16 + FastAPI + Next.js). Demo script for SIH26191 judges.**

## The 15 steps

| # | Step | Verified how |
|---|---|---|
| 1 | Open AVASYA → map loads | `frontend 200` on compose |
| 2 | Map shows RED/YELLOW/GREEN + DATA_UNAVAILABLE markers | legend contract `10_HAZARD_STATUS_SPEC.md` |
| 3 | Select RED habitation | one-click detail endpoint |
| 4 | Population + hazard evidence (with provenance labels) | ONE-ID trace assertions |
| 5 | Risk calculated | risk engine, band HIGH |
| 6 | Relocation priority generated | priority engine → IMMEDIATE |
| 7 | Destinations listed | capacity gate applied |
| 8 | Insufficient-capacity destinations rejected | RC02 usable 1,008 < 1,240 → ❌; RC03 usable 630 < 1,240 → ❌ |
| 9 | Eligible destination selected | RC01 usable 1,512 ≥ 1,240 → ✅ (gap +272) |
| 10 | Route calculated/shown | transport engine, eligible-only |
| 11 | RAG evidence retrieved | `/rag/query` → SUPPORTED, chunks with provenance |
| 12 | LLM explains recommendation | `/rag/answer` (extractive cited fallback if runtime absent) |
| 13 | Claims validated | badges: VERIFIED / CONFLICT / UNSUPPORTED |
| 14 | Officer approves | approvals endpoint |
| 15 | Audit recorded | audit table row (actor, action, payload) |

## Degradation rules for the demo

Steps 11–13 may be interrupted (corpus unindexed / LLM absent) — steps 1–10 and 14–15 **still work**, the UI says what's unavailable. That resilience is itself a demo point.

## Run it

```bash
docker compose up --build
cd frontend && npm run dev   # or open http://localhost:3001
scripts/run_mvp_checks.cmd   # API-surface validation of the same chain
```

## The winning story (pitch verbatim)

AVASYA identifies an affected habitation, determines hazard status and risk, computes the available response window, checks safe transportation and destination capacity, and uses official disaster-management guidance through RAG-grounded LLM reasoning to provide an explainable, claim-validated emergency response for the officer — who approves, with the full trail audited.
