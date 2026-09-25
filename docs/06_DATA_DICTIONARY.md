# 06 — Data Dictionary

Canonical field names as stored in Postgres and exposed by the API. **Everyone uses these names — no `village_001` vs `hab_001`.**

## Identifiers (frozen)

| Field | Type | Example | Notes |
|---|---|---|---|
| `habitation_id` | string | `H001` | THE join key across all layers |
| `destination_id` | string | `D01` | shelters/hospitals/relief centers |
| `evidence_id` | string | `EVD-001` | hazard/evidence rows and RAG chunks (`EVD-001-c1`) |
| `source_table` / `source_id` / `chunk_index` | string/string/int | | RAG chunk unique key (upsert identity) |

## Habitation

| Field | Type | Notes |
|---|---|---|
| `population` | int | authoritative exposure count — never estimated by AI |
| `lat` / `lon` | float (WGS84, EPSG:4326) | decimal degrees, signed (N+/E+) |
| `geom` | geometry (SRID 4326) | PostGIS; SRID consistency enforced on ingest |
| `district` / `state` | string | relationship consistency checked at ingest |

## Hazard & evidence

| Field | Values | Notes |
|---|---|---|
| `hazard_status` | `RED` `YELLOW` `NO_ALERT` `DATA_UNAVAILABLE` | engine output, not stored raw |
| `data_origin` | `REAL` `SYNTHETIC_DEMO` | DB-level provenance; never mix silently |
| `evidence_type` | `flood` `cyclone` `landslide` … | matches ingestion loader registry |
| `published_date` / `source_url` / `authority` | | provenance carried through to RAG chunks and UI |

## Decision fields

| Field | Type / values | Notes |
|---|---|---|
| `risk_score` | 0–100 | `ai/risk` |
| `relocation_priority` | `IMMEDIATE` `SHORT_TERM` `MEDIUM_TERM` `MONITOR` | `ai/priority` |
| `nominal_capacity` / `occupancy` / `constraints` / `safety_reserve` | int | capacity waterfall inputs |
| `usable_capacity` | int | nominal − occupancy − constraints − safety reserve |
| `travel_time_min` | int | from transport engine, only for eligible destinations |

## RAG / LLM fields

| Field | Values |
|---|---|
| `grounding_status` | `SUPPORTED` `UNSUPPORTED` |
| `answer_mode` | `llm` `extractive` |
| `claim_status` | `VERIFIED` `CONFLICT` `UNSUPPORTED` |
