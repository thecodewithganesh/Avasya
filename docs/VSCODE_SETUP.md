# Running AVASYA in VS Code

## Prerequisites (one-time)

1. **Docker Desktop** running (for PostgreSQL + optionally the full stack)
2. **Python 3.12+** on PATH — `python --version`
3. **Node 18+** — `node --version`
4. Open the **`Avasya` folder** (the inner repo folder, not the parent) in VS Code:
   `File → Open Folder → D:\Palani\Ongoing\Avasya\Avasya`
5. Install the recommended extension when prompted (Python + Debugger).

### Python environment (local-run path only)

```powershell
cd D:\Palani\Ongoing\Avasya\Avasya
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt -r ai\requirements.txt
```

VS Code: `Ctrl+Shift+P` → *Python: Select Interpreter* → pick `.venv`.

## Path A — Full stack via Docker (simplest, matches the demo)

**Run and Debug panel (`Ctrl+Shift+D`) → "AVASYA: Full stack via Docker Compose (58000/3001)" → F5**

or the task: `Ctrl+Shift+P` → *Tasks: Run Task* → **AVASYA: Run everything (Docker)**.

- Frontend: http://localhost:3001 (hazard map, evidence explorer, copilot)
- Backend API docs: http://localhost:58000/docs
- Stop with task **AVASYA: Stop Docker stack**.

## Path B — Debug backend + frontend locally (breakpoints, hot reload)

1. Start only the database (task **AVASYA: DB only**, or `docker compose up -d db`).
   The DB publishes on host port **55432** to avoid clashing with other stacks.
2. Press **F5** and pick **"AVASYA: Backend + Frontend (local dev)"** — the compound starts both:
   - Backend on **:8000** with the debugger attached (breakpoints work in any
     `backend/` or `ai/` file; env vars come from `launch.json`)
   - Next.js dev server on **:3000** with `NEXT_PUBLIC_API_URL=http://localhost:8000`
3. Open http://localhost:3000 to use the app against your locally-debugged backend.

### Useful debug configs (same F5 menu)

| Config | What it does |
|---|---|
| `AVASYA: Backend (FastAPI, :8000)` | Uvicorn with debugpy + `--reload`, opens `/docs` when ready |
| `AVASYA: Frontend (Next.js dev, :3000)` | `npm run dev` in `frontend/`, opens the browser |
| `AVASYA: Backend tests (pytest)` | Full suite (133 tests) with the debugger |
| `AVASYA: LLM module tests (ai/llm)` | Just the Qwen3 module tests |

## Tests & verification from VS Code

- **Testing sidebar** (beaker icon) — pytest is pre-configured to discover
  `tests/`, `backend/tests/`, `ai/llm/tests/`.
- Task **AVASYA: All tests** — the whole suite in one shot.
- Task **AVASYA: MVP verification (all 13 parts)** — the live-demo health
  check against the Docker stack (`scripts\run_mvp_checks.cmd`).
- Task **AVASYA: Frontend typecheck** — `tsc --noEmit`.

## Environment variables (local-run path)

Copy `.env.example` → `.env` only if you want to override defaults. The
launch profiles already set the important ones:

```
DATABASE_URL=postgresql+psycopg://avasya:avasya@localhost:55432/avasya
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:8000        # local frontend
NEXT_PUBLIC_API_URL=http://localhost:58000       # docker frontend
NEXT_PUBLIC_USE_MOCK_DATA=false
```

Optional Qwen3 LLM (leave unset for honest 503s):

```powershell
$env:AVASYA_LLM_RUNTIME="cli"
$env:AVASYA_LLM_CLI_PATH="C:\Users\Priya S\llama.cpp-new\llama-cli.exe"
$env:AVASYA_LLM_MODEL_PATH="C:\AI\Models\Qwen3-8B-Q4_K_M.gguf"
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `DATABASE_URL is required` | Launch configs set it — make sure you started via F5, or set the env var in the terminal |
| Backend can't reach DB (`connection refused`) | `docker compose up -d db` first; host port is **55432**, not 5432 |
| Frontend shows MOCK badge | `NEXT_PUBLIC_USE_MOCK_DATA` is `true` or the API probe failed; check the backend is up |
| Port 3000/8000 already in use | Another process owns it; use the Docker path (3001/58000) or stop the other process |
| 503 from `/llm/explain` or `/rag/query` | Expected — LLM/RAG teammate runtimes not configured; set the `AVASYA_LLM_*` env vars for live Qwen3 |
| Alembic errors on a fresh DB | Run `docker compose run --rm backend alembic upgrade head` once |
