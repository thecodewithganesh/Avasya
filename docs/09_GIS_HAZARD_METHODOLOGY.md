# 09 — GIS / Hazard Methodology

**Engine status: IMPLEMENTED AND TESTED** — vendored engine `backend/gis_hazardapi/`, 5-stage pipeline `gis/` (preprocessing → feature generation → validation), 27 GIS/hazard tests.

## Pipeline

```
Dataset (habitations, hazards, roads, destinations)
   ↓ 1. Preprocess: CRS → EPSG:4326, geometry flatten, bbox filter
   ↓ 2. Spatial join: habitation ∩ hazard zone
   G 3. Feature generation: exposure flags, distance-to-coast, network adjacency
   ↓ 4. Validation: geometry validity, referential checks, provenance carried
   ↓ 5. Serve: feature store for status engine + map layers
```

## Coastal boundary rule (MVP demo scope)

The analysis zone is **the mapped coastal zone of the loaded datasets** — habitations inside the dataset's coastal analysis zone are served; the boundary comes from the dataset and its documented methodology, not an arbitrary visual buffer. Documented detail: `data/raw/README` + `30_FUTURE_SCALING_PLAN.md` (coastal → nationwide phases).

## Spatial relationship → map

When the user clicks **Habitation H001**, the API returns in one flow: population, hazard, hazard status, coordinates, evidence (with provenance), timestamp, risk, priority. This is the ONE-ID trace (`tests/test_one_id_trace.py`).

## Rendering decision

**MapLibre GL, not Leaflet** — vector tiles + GPU rendering for smooth zoom/rotation over hazard polygons, proper symbol collision, and a renderer that is *replaceable*: the frontend consumes GeoJSON layers from FastAPI, so the map library is an implementation detail, not an architecture dependency.
