# 04 — MVP Scope

**The rule:** 100% completion of ONE believable end-to-end disaster-response scenario beats 30% of everything.

## The scenario we fully support

🌊 **Flood event, South India coastal demo belt → RED habitation (1,240 people) → HIGH risk → IMMEDIATE priority → Shelter A rejected (insufficient usable capacity) → Shelter B eligible → 32-min route → RAG-grounded NDMA guidance → LLM explanation → claims VERIFIED → officer approves.**

## In scope (must work)

| Area | Boundary |
|---|---|
| Geography | South India coastal demo belt. Boundary rule: analysis zone is the mapped coastal zone of the loaded datasets — the boundary comes from the dataset/methodology, not an arbitrary visual buffer |
| Hazards | **Flood end-to-end**; cyclone/landslide pipeline-ready but partial |
| Map | Current status + historical layers; prediction only where officially published |
| AI | RAG + LLM wired and tested; real corpus & runtime are config, not code |
| Auth | Demo header default; Supabase JWT when env-configured |

## Out of scope (documented, not silent)

Entire India · inland hazards · lightning prediction · real-time sensor streams · custom-trained LLM · advanced transport optimization (VRP) · historical analytics dashboards.

See `30_FUTURE_SCALING_PLAN.md` for the phase plan and `29_LIMITATIONS.md` for the honest-limits sheet.

## The demo kill-switch test

Any of these may fail mid-demo without breaking the P0 chain:

- RAG corpus empty → evidence sections say `Evidence unavailable` (503, honest)
- LLM runtime absent → explanation falls back to extractive citations
- A dataset missing → `DATA_UNAVAILABLE` shown, never a fabricated number
