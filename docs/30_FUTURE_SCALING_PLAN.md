# 30 — Future Scaling Plan

**Migrated from `SCALING_PLAN.md`. Architecture contract: India-ready — nothing in schema, engines, or API assumes a state boundary; only the *loaded data* is currently South India / demo scoped.**

## The 8 phases

| Phase | Scope | Key additions |
|---|---|---|
| 1 (now) | South India coastal MVP | flood E2E, one believable scenario — done |
| 2 | All Indian coastal regions | state SDMA data deals, coastline/habitation ingest per state |
| 3 | Multi-hazard expansion | cyclone/landslide full E2E; per-hazard status rules in the same engine |
| 4 | Inland hazards | riverine flood, drought, heatwave; boundary rule generalizes |
| 5 | Nationwide deployment | region sharding, per-state RBAC, national dashboard |
| 6 | Advanced prediction | hydrological/short-horizon models *with published validation*, never black-box claims |
| 7 | Real-time data streams | IMD/INCOIS feeds, sensor ingestion, refresh-token rotation, rate limiting |
| 8 | Large-scale optimization | transport VRP/fleet, caching tiers, secrets manager, TLS, autoscaling |

## Coastal boundary → general rule

MVP: analysis zone = mapped coastal zone of loaded datasets (documented rule, `09_GIS_HAZARD_METHODOLOGY.md`). The same pattern generalizes: **boundary = dataset + methodology, never an arbitrary buffer** — so inland phases change data, not code.

## Multi-hazard without rewrites

The status engine takes hazard-typed evidence rows; new hazards are new evidence types + severity rules, not new services. Flood→cyclone expansion is configuration + data, which is why phases 3–4 are cheap.

## AI scaling path

- RAG corpus growth: index more official documents — the chunk pipeline is idempotent (`source_table, source_id, chunk_index` upserts).
- Embeddings: swap the stub for E5 (already opt-in); hybrid retrieval (BM25 + vector) is additive.
- LLM: bigger/better models via the same llama.cpp bridge; the grounding + claim-validation layer is model-agnostic.

## Non-functional roadmap

Security hardening (rate limiting, rotation) Phase 7 · infra hardening (TLS, autoscaling, secrets) Phase 8 · historical analytics dashboards Phase 5+ · every current limitation in `29_LIMITATIONS.md` maps to a phase here — nothing is "missing forever", everything is "deferred with a plan".
