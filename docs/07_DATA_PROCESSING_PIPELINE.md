# 07 — Data Processing Pipeline

**Owner split (per team plan):** B prepares datasets on `feature/dataset-processing` → PR → integration (A) runs ingestion against the backend and verifies.

## Stage flow

```
B: raw/processed dataset (feature branch, never integration directly)
      ↓  metadata + provenance sheet (source, authority, date, licence, REAL vs synthetic)
A: drop into data/raw/  →  backend/ingestion loaders
      ↓
PostgreSQL/PostGIS (M's backend APIs read from here)
      ↓
AVASYA engines (status → risk → priority → capacity → recommendation)
```

## Ingestion checks (each loader enforces)

1. **Same column names** — loader schema, not free-form CSV discovery.
2. **Same IDs** — `habitation_id` format validated (`H\d+`), duplicates rejected.
3. **Lat/lon format** — decimal degrees WGS84; out-of-bbox rows rejected, not clamped.
4. **CRS/SRID consistent** — anything not EPSG:4326 must be reprojected by B *before* PR; loaders refuse re-projection silently.
5. **State/district/habitation relationships consistent** — referential checks at load.
6. **Hazard IDs match backend expectations** — `EVD-` evidence ids map to hazard rows.
7. **Population fields match backend** — integer, positive, source-quoted.
8. **Provenance stored** — every row lands with `data_origin` (`REAL`/`SYNTHETIC_DEMO`) and source metadata.
9. **Real vs synthetic clearly marked** — mixed datasets are split, never blended.

## Bootstrap sequence (what `docker compose up` runs)

1. `alembic upgrade head` (PostGIS + pgvector migrations)
2. seed/ingest `data/raw/` datasets
3. `rag-index` one-shot service indexes the evidence corpus into pgvector
4. backend + frontend healthy

## Verification

- 23 ingestion tests cover schema/ID/provenance enforcement.
- Live check: `docker compose exec db psql -U avasya -c "SELECT data_origin, count(*) FROM habitations GROUP BY 1;"`
