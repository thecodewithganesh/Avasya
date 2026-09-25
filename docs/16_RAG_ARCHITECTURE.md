# 16 — RAG Architecture

**Module: `backend/rag/` · 14 tests · contract: `backend/integrations/contracts.py` → `RagQueryResponse` · guide: `RAG_INTEGRATION.md`**

## Pipeline (all five stages implemented)

```
OFFICIAL DOCUMENTS (NDMA/SDMA/IMD guidelines, datasets)
   ↓ 1. chunker — structure-aware, provenance inherited
   ↓ 2. embedder — multilingual-e5-small (opt-in) or zero-vector stub (default)
   ↓ 3. indexer — document_chunks (pgvector Vector(384), HNSW cosine,
        unique (source_table, source_id, chunk_index) → idempotent re-index)
   ↓ 4. retriever — cosine ANN; HNSW-empty fallback to exact ranking
   ↓ 5. generator — LLM mode or extractive mode (top-3, cited)
```

## Generator modes (both honest)

| Mode | When | Behaviour |
|---|---|---|
| `llm` | Qwen3 runtime configured | retrieved chunks → grounded LLM answer with citations; ai/llm grounding validation still applies |
| `extractive` | default / LLM absent | answer composed **strictly** from retrieved texts with `[1] [2] [3]` citations — no invented sentence |
| — | zero matches | `grounding_status: UNSUPPORTED`, no answer fabricated |

## Correct wording (mentor-approved)

❌ "We trained RAG on the dataset."
✅ **"The RAG knowledge base is indexed from authoritative datasets and official disaster-management documents. Retrieved evidence is supplied to the LLM to ground emergency-response explanations."**

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/rag/index` | rebuild corpus (idempotent upserts) |
| `POST /api/v1/rag/query` | semantic retrieval → `RagQueryResponse` |
| `POST /api/v1/rag/answer` | retrieve + generate → `{answer, mode, grounding_status, chunks_used, warnings}` |

Failure semantics: empty corpus → 503 with setup instructions; embedder/DB errors → logged, keyword fallback on evidence search; the core decision chain is never a dependency of RAG.
