<div align="center">

# AVASYA
### People First. Always.

**Hazard Intelligence & Relocation Decision Support for Vulnerable Habitations**
*Karnataka · Kerala · Tamil Nadu · Andhra Pradesh · Puducherry*

[![SIH 2026](https://img.shields.io/badge/SIH-26191-blue?style=flat-square)](https://sih.gov.in)
[![Backend tests](https://img.shields.io/badge/tests-216%20passing-brightgreen?style=flat-square)](#tests)
[![Stack](https://img.shields.io/badge/FastAPI-%C2%B7-Next.js-%C2%B7-PostGIS-%C2%B7-pgvector-informational?style=flat-square)](#tech-stack)

</div>

---

## What AVASYA does

AVASYA connects authoritative hazard evidence to an explainable, capacity-aware relocation decision chain — and **never lets the AI decide**:

```
Hazard evidence  (IMD flood inventory · Census villages · hospital directory · rainfall)
  └─► Hazard status        RED / YELLOW / NO_ALERT / DATA_UNAVAILABLE
        └─► Risk score     locked weighted model — no post-hoc adjustment
              └─► Relocation priority    IMMEDIATE / SHORT-TERM / MEDIUM-TERM
                    └─► Destination matching    usable-capacity gate — "nearest" is never enough
                          └─► Transport + response window
                                └─► RAG evidence   official disaster-management guidance (pgvector · E5)
                                      └─► LLM explanation   grounded, cited — or honestly absent
                                            └─► Claim validation   VERIFIED / CONFLICT / UNSUPPORTED
                                                  └─► Officer approve / override   → persisted audit trail
```

Two rules the whole system is built on:

1. **The decision chain never depends on the AI.** If RAG or the LLM is down, hazard → risk → relocation → recommendation still works.
2. **Missing data is shown as missing.** `DATA_UNAVAILABLE ≠ NO_ALERT`. Evidence provenance (`REAL` / `MIXED` / `SYNTHETIC_DEMO`) is enforced at the database level and surfaced on every screen.

---

## Quick start (Docker)

```bash
git clone https://github.com/PalaniappanR02/Avasya.git && cd Avasya
docker compose up -d --build

# Backend   → http://localhost:58000   (OpenAPI docs at /docs)
# Frontend  → http://localhost:3001
# PostGIS   → localhost:55432          (avasya / avasya)
```

On first boot the backend migrates the schema, loads the demo decision chain, and starts serving. Optional LLM runtime:

```bash
docker compose --profile ollama up -d
docker compose exec ollama ollama pull llama3.2:3b
# /api/v1/rag/answer now returns mode:"llm" grounded answers with citations
```

Run the full pipeline for a habitation:

```bash
curl -X POST http://localhost:58000/api/v1/habitations/1/assess
```

### Without Docker

```bash
# Backend (Python 3.12+)
pip install -r backend/requirements.txt
export DATABASE_URL="postgresql+psycopg://avasya:avasya@localhost:5432/avasya"
uvicorn backend.main:app --port 58000 --reload

# Frontend (Node 20+)
cd frontend && npm install && npm run dev
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · TypeScript · MapLibre GL JS |
| Backend | FastAPI 0.115 · SQLAlchemy 2 · Alembic · GeoAlchemy2 |
| Database | PostgreSQL 16 + PostGIS + pgvector |
| RAG | pgvector + multilingual E5 embeddings, transparent keyword fallback |
| LLM | Ollama runtime (llama3.2:3b) or llama.cpp server — schema-constrained JSON output |
| Auth | Supabase JWT verification (HS256) with documented demo-email fallback |
| Infra | Docker Compose (db · backend · frontend · optional ollama/llama-server profiles) |

---

## API

### Decision pipeline

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/habitations` | Habitation register (paginated) |
| `GET` | `/api/v1/habitations/{id}` | Single habitation detail |
| `GET` | `/api/v1/habitations/{id}/hazards` | Hazard status per linked hazard |
| `GET` | `/api/v1/habitations/{id}/risk` | Locked risk score + factor contributions |
| `GET` | `/api/v1/habitations/{id}/relocation` | Relocation priority |
| `GET` | `/api/v1/habitations/{id}/destinations` | Capacity-gated destination list |
| `GET` | `/api/v1/habitations/{id}/recommendation` | Recommendation summary |
| `GET` | `/api/v1/habitations/{id}/transport` | Route ranking (eligible destinations only) |
| `GET` | `/api/v1/habitations/{id}/response-time` | Computed response window |
| `POST` | `/api/v1/habitations/{id}/assess` | **Full chain in one call** |

### Officer decisions

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/recommendations/{id}/approval` | Approve or override (auth required) |
| `GET` | `/api/v1/recommendations/approvals` | Persisted decision history (audit trail) |

### Evidence · RAG · AI

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/v1/rag/query` | Semantic evidence retrieval |
| `POST` | `/api/v1/rag/answer` | Grounded answer with citations + claim validation |
| `POST` | `/api/v1/rag/index` | (Re)build retrieval corpus (idempotent) |
| `POST` | `/api/v1/habitations/{id}/claims/validate` | VERIFIED / CONFLICT / UNSUPPORTED |
| `GET` | `/api/v1/knowledge-sources` | Dataset provenance registry |

### GIS

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/v1/gis/hazard-zones` | Banded RED/YELLOW/BROWN/GREEN zones, coast-clamped |
| `GET` | `/api/v1/gis/traffic-risk` | High-hazard traffic-focal locations |

---

## Data provenance — non-negotiable

| Label | Meaning |
|---|---|
| `REAL` | Authoritative government / scientific source |
| `MIXED` | Real + synthetic evidence combined |
| `SYNTHETIC_DEMO` | ⚠ Demo data only — never an official alert |
| `UNAVAILABLE` | Evidence not available — risk is NOT estimated from absence |
| `UNKNOWN` | Provenance cannot be determined |

- Missing evidence is never replaced by guessed zeros and never becomes `NO_ALERT`.
- All AVASYA-invented thresholds are labelled **AVASYA OPERATIONAL METHODOLOGY**.
- Locked risk weights: **Hazard 35% · Population 20% · Vulnerability 20% · Historical 12% · Road 13%**.

### Datasets

| Dataset | Source | Status |
|---|---|---|
| Census villages (645k rows, 5 states) | Census of India 2011 | `BLOCKED` in this checkout — the required archive/`census_clean.csv` is not present |
| Flood events (1,006 polygons, 2014–) | IMD Flood Inventory V3 | `data/raw/`, ingestable |
| Hospital directory (10k+) | National health directory | `data/raw/`, ingestable |
| IMD daily rainfall | IMD statewise | `data/raw/`, ingestable |
| Village boundaries (SoI) | Survey of India | archives in `data/raw/` |

Large archives (`.pbf`, `.7z`, `.zip`, `.pdf` susceptibility maps) are kept out of Git by `.gitignore` — share them via cloud storage and drop them into `data/raw/`. A real decision run additionally requires `data/processed/census/census_clean.csv` (or `data/raw/census_clean.csv`) with village name, district, state, latitude, longitude, and population. Do not substitute demo fixtures for this input. Ingest on the host:

```bash
python -m backend.ingestion.cli flood        # IMD flood events → hazards + evidence
python -m backend.ingestion.cli hospitals    # hospital directory → evidence
python -m backend.ingestion.cli census       # census archive → habitations
```

---

## Environment variables

Copy `.env.example` → `.env`. Key values:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | compose default | PostgreSQL/PostGIS connection |
| `CORS_ORIGINS` | localhost dev ports | Allowed browser origins |
| `SUPABASE_URL` / `SUPABASE_JWT_SECRET` | unset | Enable Supabase officer auth |
| `AVASYA_LLM_RUNTIME` | unset | `ollama` or `server` to enable LLM mode |
| `AVASYA_LLM_OLLAMA_URL` | `http://ollama:11434` | Ollama endpoint (compose profile) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:58000` | Backend base URL for the browser |
| `NEXT_PUBLIC_USE_MOCK_DATA` | `false` | `true` = labelled offline demo dataset |

---

## Tests

```bash
python -m pytest                                   # 216 passing (SQLite-mirrored stack)
python -m pytest tests/test_v12_proofs.py          # 5 Mandatory Proofs (Real, Mutation, Second Record, Kill-Switch, LLM Grounding)
cd frontend && npx tsc --noEmit && npm run build # typecheck + production build
```

CI (`.github/workflows/ci.yml`) runs the backend suite and the frontend build on every push.

---

## Documentation

`docs/` holds a numbered series (00–30) — start here:

- [`docs/00_PROJECT_OVERVIEW.md`](docs/00_PROJECT_OVERVIEW.md) — index to the whole series
- [`docs/25_E2E_DEMO_SCENARIO.md`](docs/25_E2E_DEMO_SCENARIO.md) — the 15-step live demo script
- [`docs/28_INTEGRATION_STATUS.md`](docs/28_INTEGRATION_STATUS.md) — what is wired and verified
- [`docs/DESIGN_DIRECTION.md`](docs/DESIGN_DIRECTION.md) — the government-grade UI design contract
- [`docs/RAG_INTEGRATION.md`](docs/RAG_INTEGRATION.md) · [`docs/LLM_INTEGRATION.md`](docs/LLM_INTEGRATION.md) — module-owner guides

---

## Design principles

- **Accessibility first** — WCAG 2.1 AA contrast, semantic HTML, keyboard navigation, no decorative noise
- **Data honesty** — provenance badges on every screen; synthetic data can never masquerade as real
- **Officer sovereignty** — AVASYA recommends, the human decides; every decision is persisted and auditable
- **No fabrication** — the AI may not invent numbers; claims are checked against structured data (1,240 people vs "approximately 1,500" → `CONFLICT`)

---

## Contributing

See `CONTRIBUTING.md`. Branch from `main` with `feat/` / `fix/` / `docs/` prefixes; PRs need a passing suite. The integration flow for module owners (B datasets · C Supabase · D RAG · E LLM · F frontend) is described in `docs/27_TEAM_CONTRIBUTIONS.md`.

---

<div align="center">

**AVASYA · Smart India Hackathon 2026 · SIH26191**

*Built for the Ministry of Jal Shakti — Disaster Management & Relocation Intelligence*

</div>
