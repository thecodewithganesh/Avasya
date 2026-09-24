# 05 — Data Sources

**Rule: nothing becomes REAL until its ingestion ran and its provenance says REAL. SYNTHETIC_DEMO fixtures stay labelled, always.**

*(Compiled from the team's data-sources roadmap — updated with current ingestion state.)*

## Loaded today (`data/raw/`)

| Dataset | Authority | Access path | Ingestion touchpoint |
|---|---|---|---|
| Coastlines | Survey of India / OpenStreetMap coastline extracts | shapefile/geojson download → `data/raw/` | `backend/ingestion/` coastline loader |
| Habitations (demo belt) | Census/audited demo fixture | geojson → `data/raw/` | habitation loader (id, population, lat/lon) |
| Hazard zones | IMD/SDMA published zones or labelled demo fixtures | geojson → `data/raw/` | hazard loader (status, evidence link) |
| Historical events | EM-DAT / state disaster records | csv/geojson → `data/raw/` | historical-event loader |
| Hospitals | Health facility registries (demo-labelled where synthetic) | geojson → `data/raw/` | destination loader (capacity fields) |
| Population gridded | WorldPop / Census ward data | raster/csv → `data/raw/` | population join into habitations |
| Relief centers | SDMA lists / demo fixtures | geojson → `data/raw/` | destination loader |
| Roads | OpenStreetMap extracts | osm/geojson → `data/raw/` | road network loader (transport graph) |

## Priority real-ingestion targets (pre-demo)

1. **NDMA/SDMA guideline PDFs → RAG corpus** (the guidance basis for the LLM). Loader: `python -m backend.rag` against `data/documents/`.
2. **IMD current warnings** → hazard status input (manual paste is acceptable for MVP demo; API integration documented in scaling plan).
3. **Real hospital capacity fields** — mark `REAL` only when the source says capacity explicitly.

## Accepted-labelled fixtures

Everything under `data/raw/` that is not from an authority is loaded as `SYNTHETIC_DEMO` via `data_origin`. The map legend, API responses, and evidence text all carry the label. This is a feature for judge questions: *"Why does this habitation say SYNTHETIC?"* — *"Because it is, and we don't fake it."*
