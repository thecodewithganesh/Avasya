# AVASYA MASTER PROMPT — SECTION 0 (PREPEND THIS BEFORE THE MAIN PROMPT)

> Paste this block ABOVE the main master prompt. It contains execution-verified facts
> about the repository as of 2026-09-24 (branch `main`, commit `bd16457`, 18 files of
> uncommitted verified repairs kept intentionally uncommitted). Everything below was
> proven by running commands, not by reading code. The main prompt's generic
> instructions remain valid EXCEPT where Section 0 corrects them.

## 0.1 VERIFIED SYSTEM STATE (do not re-audit from zero — verify, then build on this)

| Area | Verified status | Evidence |
|---|---|---|
| Python compilation | PASS | `python -m compileall -q backend ai gis tests scripts` → exit 0; 114 files compiled |
| Python deps | PASS | 13 modules import on Python 3.13.14; psycopg 3.3.5, GeoAlchemy2 0.20.0 (pin says 0.15.2 — drift, harmless) |
| Tests | PASS | `python -m pytest tests ai -v` → **209 passed, 1 skipped, 0 failed** (~7s); skip = live-model placeholder |
| Frontend build | PASS | `npm run build` exit 0, 17/17 routes; `npx tsc --noEmit` exit 0 |
| Frontend lint | **FAIL** | `npm run lint` exit 1. Real source errors (after excluding `.netlify/`, `.next/` artifacts): `command-dashboard.tsx:341` + `hazard-map-workspace.tsx:268` (`react-hooks/set-state-in-effect`), `recommendation-details.tsx:244` (`react/no-unescaped-entities`) |
| Backend startup | PASS | `python -m uvicorn backend.main:app --port 58001` binds and serves; log "Application startup complete" |
| /health | PASS | HTTP 200 `{"status":"ok","database":"ok"}` (Docker :58000 and in-container :8000) |
| Database | PASS | Postgres 14 tables, alembic head `20260917_000001`, 20,997 habitations, 5 destinations, 3,261 evidence rows + 3,261 document_chunks |
| Docker | PASS | `avasya-db`, `avasya-backend` (healthy), `avasya-frontend` (:3001), `avasya-ollama` (healthy). `avasya-rag-index` Exited(0) is a normal one-shot job |
| API surface | 32 paths under `/api/v1` (see `GET /openapi.json`) — risk, assess, recommendation, capacity, approvals, rag, llm, claims, gis, transport all exist |

## 0.2 ⚠ HIGHEST-PRIORITY CONFLICT: LIVE DEMO NUMBERS ≠ CANONICAL NUMBERS

The canonical, PPT-approved numbers come from the CLI pipeline
(`PYTHONPATH=. python ai/pipeline.py` against `data/habitation_evidence.json` +
`data/processed/destinations/destinations_clean.json`):

```
H001  risk 55.3 HIGH  IMMEDIATE  pop 1,240  → RC01 usable 1,512 (1800−54−54−0−180) gap +272 ELIGIBLE
H002  51.8 → RC02   H003 47.3 MODERATE→IMMEDIATE(escalation) → RC01
H004  9.1 LOW  H005 8.4 LOW  → MEDIUM_TERM
What-if RC01 excluded → NO eligible destination (RC02 usable 1,008 < 1,240) → escalation message
```

But the LIVE Docker demo database (what the UI actually shows) serves:

```
GET /api/v1/habitations/1/assess → risk 47.0 LOW, priority MONITOR
GET /api/v1/destinations/1/capacity → usable 1,800, gap +820
```

Root causes (verified in code and DB):
1. Live DB has NO habitation↔hazard evidence links → `hazard_status: DATA_UNAVAILABLE`
   → hazard component contributes 0.
2. `backend/services/decision.py::_components` hardcodes vulnerability contribution to 0.0.
3. Demo destination rows in DB carry no water/sanitation/safety-reserve deductions
   (CLI applies them: −54 −54 −0 −180).

**P0 REPAIR (do this before any UI work):** make the live demo DB reproduce the
canonical numbers — seed the hazard-evidence links and destination constraint
deductions so `GET /api/v1/habitations/1/assess` returns risk ≈ 55.3 HIGH IMMEDIATE
and RC01 usable 1,512 gap +272. If a component genuinely cannot be seeded (e.g.
vulnerability data), fix the engine path or honestly document the difference — never
fake the number. **No PPT slide, no demo script, no UI copy may ship while these two
datasets disagree.** Re-run `python -m pytest tests ai -v` after any engine change.

Priority boundary truth (unit-verified, keep as regression tests):
69.9→SHORT_TERM, 70.0→IMMEDIATE, 40.0→SHORT_TERM, 39.9→MEDIUM_TERM,
pop≥500 escalates to IMMEDIATE even at 39.9; pop 499 does not.
Capacity hard gate live-verified: a destination with usable < required is NEVER selected,
and draining all destinations yields `NO_ELIGIBLE_DESTINATION` (never a fabricated rec).
Approval flow live-verified: APPROVE → 201; OVERRIDE without note → 422 "override_note
is required for OVERRIDE"; no officer header → 401.

## 0.3 AI/RAG — ACCURATE RUNTIME STATUS (corrects main prompt §9)

- **Deployed LLM runtime is `llama3.2:3b` via Ollama** (`avasya-ollama` container, :11434).
  The code ALSO supports Qwen3-8B-Q4_K_M via llama.cpp CLI/server. Qwen3 is NOT the live
  runtime. Correct language: "Local LLM (llama3.2:3b via Ollama; Qwen3-8B supported via
  llama.cpp)". NEVER say "Qwen3 live".
- **Verified live (Phase 13):** Ollama generation works (cold ~45–240s on CPU,
  warm ~45–65s per structured call; `AVASYA_LLM_TIMEOUT=300`). `/api/v1/llm/explain`
  returns 200 with full avasya_context. **Grounding verified:** with missing context the
  system removes the invented claim and answers "Not available from the provided evidence"
  — no hallucination. **Claim validation verified live:** population 1240 vs 1240 →
  VERIFIED; 1500 vs 1240 → CONFLICT ("AVASYA value is authoritative").
- **Embeddings:** `backend/rag/config.py` defaults `EMBEDDING_PROVIDER="null"` →
  NullEmbedder stub; retrieval runs in KEYWORD mode (verified: rag/index 9,340ms,
  3,261 chunks, idempotent; rag/query 2,073ms, 5 chunks). The E5-small/pgvector semantic
  path is implemented but NOT active by default and NOT runtime-verified. Classification:
  "Semantic RAG (E5 + pgvector) implemented, disabled by default; keyword retrieval +
  grounding + claim validation verified live."

## 0.4 MEASURED BENCHMARKS (real, reuse them; do not re-invent)

```
assess chain (full)      694 ms        GET /risk                53 ms
GET /capacity             19 ms        GET /destinations        77 ms  (2 eligible)
GET /recommendations(500)124 ms        rag/index              9,340 ms (idempotent re-run)
rag/query               2,073 ms        llm/explain (warm) ~65 s (Ollama, CPU)
```

## 0.5 CONFIRMED KNOWN ISSUES (verified this session — main prompt §11 answers)

1. `frontend/apply-all-fixes.py` + 19 sibling `fix*.py` scripts: SyntaxError at line 102,
   dead leftovers — safe to DELETE (clean repo hygiene, not a runtime issue). VERIFIED STILL EXISTS.
2–4. `shared/` directory: **all 12 files are 0 bytes** (contracts, types, mock-data).
   Either fill minimally or remove from repo — do not leave empty files. VERIFIED STILL EXISTS.
5. psycopg/geoalchemy2: fixed and importable (host versions differ from pin; acceptable). VERIFIED FIXED.
6. Frontend env: works (build exit 0). `npm install` itself never run in-session. PARTIAL.
7. census_clean.csv: EXISTS, 645,829 lines, 71 MB, provenance REAL (Census of India 2011). VERIFIED FIXED.
8. Duplicate migration dirs: `database/migrations` (active, per alembic.ini) and
   `scripts/database/migrations` (inert duplicate, same versions). VERIFIED STILL EXISTS — dedupe.
9. Destination logic tied to habitation ID 1: grep found no `id == 1` in decision.py;
   what-if recalculation verified live. NOT VERIFIED as an issue — re-test with habitation ≠ 1.
10. Auth: exactly ONE route (`POST /api/v1/recommendations/{id}/approval`) requires the
    officer dependency. All other POST routes (evidence, intelligence, rag_admin) are
    UNAUTHENTICATED. VERIFIED STILL EXISTS — extend `_officer` or document honestly.

## 0.6 DATA PROVENANCE (verified; keep visible in UI)

REAL: census_clean.csv (645,829 rows, Census 2011), rainfall_clean.csv (IMD),
vulnerability_clean.csv (district, 2021), ~575 MB susceptibility PDFs + PMGSY roads in
data/raw (ingested only via manual `backend/ingestion/south_india.py` — NOT in docker-compose).
SYNTHETIC_DEMO: habitation_evidence.json, destinations_clean.json, and everything the live
demo DB serves (every DB row is labeled SYNTHETIC_DEMO — verified). The UI must keep showing
these labels. Frontend `.env.local`: `NEXT_PUBLIC_USE_MOCK_DATA=false` → live backend.

## 0.7 WORKING-TREE RULE

18 files (15 M, 3 D) of verified repairs are intentionally UNCOMMITTED; commit only
immediately before cloud deploy. Any new agent must `git status --short` first, must not
revert or stash these, and must keep repairs intact.

## 0.8 EXECUTION ORDER FOR THIS ENGAGEMENT

1. P0 data repair (0.2) → verify live API returns canonical numbers → re-run full test suite.
2. Fix 3 lint errors + delete dead fix*.py scripts + resolve shared/ empties + dedupe migrations.
3. THEN the main prompt's UI/UX work (Sections 12–33), building on the already-done
   anti-vibecode pass (glassmorphism/neon cleanup, N+1 fix in `lib/api.ts` getHabitations —
   was 1,001 requests → 1, dashboard evidence fetch — are DONE; don't redo).
4. PPT (markdown slide spec) uses ONLY post-repair live-verified numbers.
5. Final report per main prompt §49, appending to — not replacing — this Section 0 evidence.
