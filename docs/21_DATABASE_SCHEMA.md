# 21 — Database Schema

**Schema truth: `backend/models/` (SQLAlchemy 2) + `database/migrations/` (Alembic). This doc mirrors them — if they disagree, the code wins and this doc gets updated in the same PR.**

## Tables (12)

| Table | Key columns | Purpose |
|---|---|---|
| `habitations` | `habitation_id` PK, `population`, `lat`/`lon`, `geom` (SRID 4326), `district`, `state` | the ONE-ID anchor |
| `hazards` | `hazard_id`, `evidence_type`, `geom`, `data_origin` | hazard zones with provenance |
| `evidence` | `evidence_id` (`EVD-…`), `source`, `published_date`, `source_url`, `authority`, `data_origin` | provenance-complete evidence |
| `document_chunks` | `(source_table, source_id, chunk_index)` UNIQUE, `embedding Vector(384)`, provenance cols | RAG corpus, HNSW cosine index |
| `risk_assessments` | habitation FK, `risk_score`, `band` | engine outputs, cached |
| `relocation_priorities` | habitation FK, `priority` class | ranked list |
| `destinations` | `destination_id`, `nominal_capacity`, `occupancy`, `constraints`, `safety_reserve`, `usable_capacity` | capacity waterfall inputs |
| `capacity_assessments` | destination FK, verdict | ELIGIBLE / INSUFFICIENT |
| `recommendations` | habitation FK, destination FK, route info | final gated recommendation |
| `approvals` | recommendation FK, officer, action, timestamp | approval/override audit |
| `users` | email, role, supabase `sub` | RBAC + auth join |
| `audit` | actor, action, entity, payload | immutable trail |

## Migrations

1. `20260916_000001` — initial PostGIS schema (12 tables, spatial indexes)
2. `20260917_000001` — pgvector extension, `document_chunks`, HNSW cosine index

## Provenance rule (DB-enforced)

`data_origin ∈ {REAL, SYNTHETIC_DEMO}` with a CHECK constraint — no silent blending, mixed datasets split at load (`08_DATA_PROVENANCE.md`).

## Supabase compatibility

Standard Postgres works as-is: point `DATABASE_URL` at the Supabase pooler, enable `postgis` + `vector` extensions in the dashboard first, then `alembic upgrade head` (`INTEGRATIONS.md`).
