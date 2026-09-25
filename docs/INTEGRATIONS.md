# AVASYA Integration Matrix

Single source of truth for every external integration: what is wired, how it
is verified, and how to turn each one on.

| Integration | Status | Module | Verify |
|---|---|---|---|
| Supabase Auth | ✅ wired, tested (optional by env) | `backend/integrations/supabase.py` → `_officer` dependency | `tests/test_supabase_auth.py` |
| Supabase Postgres | ✅ supported (DATABASE_URL) | `backend/core/database.py` | `/health/db`; set `DATABASE_URL` to the Supabase pooler connection string |
| Supabase Storage | 🟡 helper ready, opt-in | `backend/integrations/supabase.py::storage_client` | requires `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` |
| RAG retrieval | ✅ wired, tested, **live on Docker** | `backend/rag/` + `backend/integrations/rag_client.py` | `tests/test_rag.py`; `docker compose run --rm rag-index`; `POST /api/v1/rag/query` |
| RAG generation (answers) | ✅ wired, tested | `backend/rag/generator.py` | `tests/test_rag.py`; `POST /api/v1/rag/answer` |
| LLM (Qwen3-8B / llama3.2:3b) | ✅ wired, runtime opt-in | `ai/llm/` via `backend/integrations/llm_client.py` | tests; 3 runtimes: `ollama` (compose `ollama` profile + `ollama pull llama3.2:3b`), llama.cpp `server`/`cli` (`llm` profile + GGUF) |
| E5 embeddings | ✅ wired, opt-in | `backend/rag/embedder.py` | set `EMBEDDING_PROVIDER=huggingface`, re-index |
| GIS hazard engine | ✅ wired (vendored) | `backend/gis_hazardapi/` → `backend/routes/gis.py` | `tests/test_gis_routes.py`, `tests/test_hazard_zones.py` |
| Docker stack | ✅ builds & runs live | `docker-compose.yml` (db+backend+rag-index+frontend, optional `llm` profile) | `docker compose up -d` → all healthy; `/health/db` ok |
| Postgres/PostGIS DB | ✅ wired | Alembic `database/migrations/` | `docker compose up` → `/health/db` returns `{"database":"ok"}` |
| Ingestion (census/GIS) | ✅ wired | `backend/ingestion/` | `tests/test_ingestion.py` |

## Supabase setup (when you create the project)

1. Create the project at supabase.com → copy **Settings → API** values.
2. Backend env (`.env`, never committed):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_JWT_SECRET=<JWT Secret>          # HS256 secret, NOT the anon key
   SUPABASE_SERVICE_ROLE_KEY=<service role>  # only if using Storage helpers
   SUPABASE_AUTO_PROVISION=true
   ```
3. Frontend build env (anon key only — safe to expose):
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
   ```
4. Database: point `DATABASE_URL` at the Supabase Postgres pooler
   (Session mode, e.g. `postgresql+psycopg://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres`),
   run `alembic upgrade head` (creates PostGIS tables + `document_chunks`;
   Supabase Postgres ships pgvector ≥0.5 — verify with
   `SELECT extname FROM pg_extension` after enabling the `vector` extension
   in the Supabase dashboard, and `postgis` under Database → Extensions).
5. Auth → Providers: enable Email (or Google etc.). Users sign in from the
   frontend (`lib/supabase.ts` exposes the client); requests then carry
   `Authorization: Bearer <jwt>`.
6. Grant roles: a verified new user is auto-provisioned **role-less**; an
   admin updates the `users` row (`role='officer'`) before approvals work.

### Auth behaviour (enforced in `_officer`, backend/routes/api.py)

- `Authorization: Bearer <jwt>` present **and Supabase configured**:
  token verified (HS256, `aud=authenticated`, expiry). Invalid/expired →
  **401, never a silent fallback**.
- Verified JWT + no `users` row → auto-provisioned role-less → 401 until an
  admin grants officer/admin (same RBAC as before).
- Supabase **not configured** → legacy `X-Officer-Email` demo mechanism,
  unchanged for local demos and the mock frontend.

## Security rules

- `SUPABASE_JWT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` are backend-only
  secrets; only the anon key may appear in frontend code/build args.
- Never log raw bearer tokens; rotate any secret that was ever shared in
  chat or committed.
- The LLM is never authoritative for operational values — grounding
  validation strips unverified claims (docs/LLM_INTEGRATION.md).
