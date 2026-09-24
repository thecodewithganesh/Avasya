# RAG Integration Guide

**Status: WIRED — the RAG module is integrated at `backend/rag/` and served
through the documented contract.**
(`backend/integrations/contracts.py`, `backend/integrations/rag_client.py`,
`backend/routes/intelligence.py` → `POST /api/v1/rag/query`)

The retrieval stack (chunking → E5 embeddings → pgvector indexing →
cosine retrieval) lives in `backend/rag/` and is adapted — never
reimplemented — by `backend/integrations/rag_client.py` to the typed
contract below.

## Contract (Pydantic, enforced at the API boundary)

Request — `POST /api/v1/rag/query`:

```json
{
  "query": "flood relocation guidelines for Thanjavur district",
  "filters": { "hazard_type": "flood", "state": "Tamil Nadu", "district": "Thanjavur" },
  "top_k": 5
}
```

Response:

```json
{
  "grounding_status": "SUPPORTED",
  "results": [
    {
      "chunk_id": "ndma-guidelines-2024#p12-c3",
      "text": "…retrieved passage…",
      "source_id": "NDMA-GUIDELINES-2024",
      "title": "National Disaster Management Guidelines",
      "authority": "NDMA",
      "source_url": "https://ndma.gov.in/…",
      "page": 12,
      "section": "Relocation",
      "published_date": "2024-06-01",
      "score": 0.91
    }
  ]
}
```

`grounding_status` is `"SUPPORTED"` when at least one result is returned,
`"UNSUPPORTED"` otherwise. RAG results are **evidence for the LLM and the
officer**, never authoritative for operational values.

## Operating the wired stack

1. **Migrate** (creates `document_chunks` + pgvector + HNSW index):
   `alembic upgrade head` (docker-compose runs this automatically; the `db`
   image is PostGIS + pgvector via `infrastructure/Dockerfile.db`).
2. **Index the corpus** (chunk → embed → upsert, idempotent):
   - in Docker bootstrap it runs automatically (`python -m backend.rag`), or
   - call `POST /api/v1/rag/index` (body `{"habitation_id": null,
     "batch_size": 50}`), or
   - run `python -m backend.rag` on the host.
3. **Query**:
   - `POST /api/v1/rag/query` — ranked chunks only.
   - `POST /api/v1/rag/answer` — full pipeline (retrieve → generate): a
     grounded, cited answer. When the Qwen3 runtime is configured
     (`AVASYA_LLM_*` env), the answer is LLM-written through the grounding
     validator; otherwise it is strictly extractive from the retrieved
     chunks — never fabricated in either mode.

   Empty corpus / broken stack → honest 503 `integration_pending`, never
   fabricated passages.

`POST /habitations/{id}/explain` uses the same full pipeline: retrieval-
grounded citations with extractive/LLM modes, falling back to direct LLM
over persisted evidence rows when the corpus is empty.

Embeddings: `EMBEDDING_PROVIDER=null` (default) uses a zero-vector stub so
the stack boots without ML deps; set `EMBEDDING_PROVIDER=huggingface` with
`intfloat/multilingual-e5-small` (384-dim) for real semantic retrieval.

`POST /evidence/search` (officer explorer) prefers semantic retrieval when
the corpus is indexed and transparently falls back to keyword ranking when
it is not — the response's `retrievalMethod` always says which engine ran.

**Do not** change the response shape — the LLM integration and the frontend
consume the contract, not your internals.
