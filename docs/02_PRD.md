# 02 — Product Requirements Document

**Status:** MVP frozen · companion to `01_TRD.md` (technical) and `04_MVP_SCOPE.md` (boundary)

## 1. Problem

District officers decide habitation relocations during floods/cyclones from scattered spreadsheets, phone calls, and intuition. They have no single screen that shows: who is exposed, how bad, how much time, where is safe, how do they get there — with sources they can defend after the event.

## 2. Users

- **Primary:** District disaster-management officer (approves/overrides relocation plans).
- **Secondary:** GIS analyst (data loading), control-room operator (monitoring).

## 3. Core user flow (the product)

1. Open AVASYA → map loads with habitations coloured by hazard status.
2. Click a RED habitation → population, hazard, status, risk, response window appear.
3. See destinations filtered by **usable capacity** — insufficient ones visibly rejected.
4. See route + travel time from capacity-eligible destinations only.
5. One click → **emergency-response explanation** grounded in official guidance (RAG→LLM) with per-claim validation badges.
6. Officer approves or overrides → recorded in audit.

## 4. MVP feature list

| Feature | Priority | Status |
|---|---|---|
| MapLibre hazard map (red/yellow/green + DATA_UNAVAILABLE) | P0 | ✅ done |
| Habitation detail: population, hazard, evidence, timestamp | P0 | ✅ done |
| Risk score + relocation priority | P0 | ✅ done |
| Capacity waterfall + destination eligibility | P0 | ✅ done |
| Capacity-constrained transport + travel time | P0 | ✅ done |
| RAG evidence retrieval (honest UNSUPPORTED) | P1 | ✅ done |
| Grounded explanation + claim validation badges | P1 | ✅ done |
| Officer approval + audit | P0 | ✅ done |
| Supabase auth (optional) | P1 | ✅ done (env-gated) |
| Real E5 embeddings | P1 | 🟡 env-gated (`EMBEDDING_PROVIDER=huggingface`) |
| Live LLM runtime | P1 | 🟡 env-gated (`AVASYA_LLM_*`) |

## 5. Explicit non-goals (MVP)

- Entire-India coverage (coastal South India demo scope — see `30_FUTURE_SCALING_PLAN.md`).
- Autonomous actions: the system **recommends**, the officer **decides**.
- Generic AI chat. AI is embedded in the workflow only.
- Prediction beyond officially published short-horizon forecasts.

## 6. Success criteria (demo-defensible)

- One habitation id traceable through every layer in a single request flow (the ONE-ID test).
- A judge can click any number in the UI and find its source: DB row, dataset, or official document.
- Kill the LLM container mid-demo → the core chain still works, the UI says "AI explanation unavailable".
