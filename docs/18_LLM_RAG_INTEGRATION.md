# 18 — LLM ↔ RAG Integration

**The connection you own (integration) between D's retrieval and E's generation — implemented in `backend/rag/generator.py`, wired by `backend/integrations/rag_client.py`.**

## The full chain (one call)

```
Frontend → POST /api/v1/rag/answer
   ↓
retriever → top-k evidence chunks (provenance carried)
   ↓
structured AVASYA facts (habitation, status, risk, capacity, travel time)
   ↓
generator:
   ├─ LLM configured → ai/llm explain(question, facts, rag_evidence)
   │      → grounding validation + claim stripping (ai/llm module)
   └─ else → extractive answer: top-3 chunks verbatim, [1][2][3] cited
   ↓
{answer, mode: llm|extractive, grounding_status, chunks_used, warnings}
   ↓
claim validator (VERIFIED / CONFLICT / UNSUPPORTED badges)
   ↓
frontend: "Generate Emergency Response" panel + Evidence Explorer
```

## Who owns what (no double implementations)

| Owner | Module | Contract |
|---|---|---|
| D (RAG) | `backend/rag/` chunker/embedder/indexer/retriever | `RagQueryResponse` |
| E (LLM) | `ai/llm/` two-stage service | `LlmRequest`/`LlmResponse` |
| A (you) | `backend/rag/generator.py` + adapters | one call `/rag/answer`; `/habitations/{id}/explain` routes through the full pipeline when the corpus is indexed |

## Degradation matrix

| Condition | Behaviour |
|---|---|
| Corpus not indexed | 503 + setup instructions (honest, not silent) |
| Corpus indexed, no matches | `UNSUPPORTED`, no answer |
| Corpus indexed, LLM down | extractive cited answer |
| LLM up, claim conflicts DB | CONFLICT surfaced, conflicting text stripped |

The demo can be interrupted at any AI layer and still land on officer approval.
