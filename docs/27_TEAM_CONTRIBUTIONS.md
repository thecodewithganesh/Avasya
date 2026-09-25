# 27 — Team Contributions & Git Workflow

**The rule that prevents integration hell: nobody pushes module code into integration directly.**

## Ownership map

| Person | Owns | Deliverable into integration |
|---|---|---|
| B | Dataset preprocessing | `data/raw/` outputs + loaders/_metadata on `feature/dataset-processing` |
| C | Supabase/PostGIS | schema/migrations/config on `feature/supabase` |
| D | RAG | `backend/rag/` content + corpus on `feature/rag` |
| E | LLM | `ai/llm/` + runtime config on `feature/llm` |
| F | Transport + Frontend | `frontend/` + `backend/transportation/` on `feature/frontend-transport` |
| A (you) | Integration | merge gate on `integration/avasya-mvp` — connects + E2E-verifies every PR |

## Branch model

```
main
 └── integration/avasya-mvp          ← A tests every merge here
      ├── feature/dataset-processing (B)
      ├── feature/supabase           (C)
      ├── feature/rag                (D)
      ├── feature/llm                (E)
      └── feature/frontend-transport (F)
```

## Per-teammate release steps (paste-ready)

```bash
# everyone, on their own machine — from the latest integration branch:
git checkout integration/avasya-mvp && git pull
git checkout -b feature/<your-module>

# ...work, commit only YOUR module's paths...

git push -u origin feature/<your-module>
# then open a PR → integration/avasya-mvp (A reviews + runs the suite)
```

- **B is unblocked:** push only `data/` + `backend/ingestion/` paths; processed outputs go to `data/processed/`, not integration root. No conflict with backend engine code.
- **C:** only migrations/config. **D:** only `backend/rag/` + `data/documents/`. **E:** only `ai/llm/` + env templates. **F:** only `frontend/` + `backend/transportation/`.
- Merge order that avoids clashes: C (schema) → B (data) → D (RAG corpus) → E (LLM) → F (frontend).

## The acceptance gate (every PR)

1. `python -m pytest tests/ ai/ backend/ -q` green (currently 197)
2. `cd frontend && npx tsc --noEmit && npx eslint .` clean
3. ONE-ID trace test still passing (cross-layer contract intact)
4. No new fabricated-value paths: any unavailable value labelled, never guessed
