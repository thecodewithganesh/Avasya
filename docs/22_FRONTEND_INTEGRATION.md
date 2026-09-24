# 22 — Frontend Integration

**App: `frontend/` — Next.js 15 + MapLibre GL · production build verified · frontend never talks to the DB**

## Data layer rules

1. **Frontend → FastAPI → services → Postgres.** The frontend never connects to Supabase/Postgres for operational data.
2. Dual-mode client (`lib/api.ts` + `lib/evidence-api.ts`): `NEXT_PUBLIC_DATA_MODE=demo` serves the mock fixture data; LIVE mode hits the real endpoints. Mock demo mode untouched.
3. **AI is not generic** — no chat window. AI lives in the workflow: Evidence Explorer (retrieval), habitation explain panels, and the CoPilot "Generate Emergency Response" flow (question + structured facts → RAG → LLM → cited answer + claim badges).

## Map

MapLibre GL renders GeoJSON layers from FastAPI (renderer is replaceable — see `09_GIS_HAZARD_METHODOLOGY.md`). Legend: RED / YELLOW / NO_ALERT / DATA_UNAVAILABLE, each visually distinct — `DATA_UNAVAILABLE ≠ NO_ALERT` is a UI rule, not a footnote.

## Auth

`lib/supabase.ts` optional client (env-gated). Enabled → every call sends `Authorization: Bearer <token>`; disabled → demo `X-Officer-Email` header, unchanged. Only the **anon key** lives in the frontend; JWT secret and service-role key stay backend-only.

## Honest states in the UI

| Backend says | Frontend shows |
|---|---|
| 503 `integration_pending` | "Evidence unavailable — corpus not indexed" with setup hint |
| `UNSUPPORTED` | "No matching evidence" — never a made-up card |
| LLM absent | Extractive cited answer labelled as such |
| `SYNTHETIC_DEMO` rows | Label visible on map + detail cards |

## Key files

`lib/api.ts` (officer headers, base URLs) · `lib/api-base.ts` (shared URLs) · `lib/evidence-api.ts` (RAG client) · `lib/supabase.ts` · `components/rag/evidence-explorer.tsx` · `components/ui/copilot-drawer.tsx`
