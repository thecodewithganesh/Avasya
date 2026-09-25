# 26 — Deployment

**Everything ships in Docker. Verified live: db + backend healthy, frontend 200, RAG auto-indexed.**

## Services (docker-compose.yml)

| Service | Image/build | Notes |
|---|---|---|
| `db` | PostGIS 16 **+ pgvector** (`infrastructure/Dockerfile.db` layers vector onto PostGIS — PostGIS doesn't ship it) | host port 55432 |
| `backend` | FastAPI slim target (`backend/Dockerfile`) | bootstrap: alembic → ingest/seed → uvicorn; port 58000 |
| `frontend` | Next.js 15 standalone (`frontend/Dockerfile`) | port 3001; Supabase build args declared |
| `rag-index` | one-shot corpus indexer (auto-runs after seed) | idempotent upserts |
| `llm` | llama.cpp server (`infrastructure/Dockerfile.llm`) | **profile `llm`** — needs Qwen3 GGUF in `./models` |
| `dbadmin` | Adminer | **profile `dbadmin`** → :8081 |

## Run

```bash
docker compose up --build                    # full stack + auto-index
docker compose --profile dbadmin up -d       # + DB UI
docker compose --profile llm up -d           # + LLM server (drop GGUF in ./models)
```

## Build hygiene (why builds are fast/slim)

- Root + frontend `.dockerignore`s keep `node_modules`/venvs out of build context.
- ML deps (torch, sentence-transformers) split to `backend/requirements-ml.txt` → opt-in `backend-ml` build target. Default image builds in ~24s; real E5 is `docker compose build backend-ml` + `EMBEDDING_PROVIDER=huggingface`.
- Backend image copies `ai/` package structure correctly (a copy bug that overwrote `ai/llm/__init__.py` was found and fixed during live bring-up).

## Env templates

Root `.env.example` and `frontend/.env.example` cover: DATABASE_URL, SUPABASE_* (6 vars), AVASYA_LLM_*, EMBEDDING_PROVIDER, NEXT_PUBLIC_* — compose passes all of them through.

## Supabase deployment option

Point `DATABASE_URL` at the Supabase pooler, enable `postgis` + `vector` extensions in the dashboard, `alembic upgrade head`, set the six `SUPABASE_*` vars — no code change (`INTEGRATIONS.md`).

## Environments

`docker-compose.yml` is the demo/staging truth. Production hardening (secrets manager, TLS, autoscaling) → `30_FUTURE_SCALING_PLAN.md` Phase 8.
