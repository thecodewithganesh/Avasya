# 08 — Data Provenance

**Principle: every number in the UI can answer "where did you get this?"**

## The provenance chain

```
Authority document/dataset
   ↓  (ingestion: loader records source)
data_origin + source metadata on every row
   ↓  (RAG indexing: chunk inherits)
document_chunks.provenance (source_id, authority, source_url, published_date)
   ↓  (API: contract carries it through)
Frontend badge: REAL / SYNTHETIC_DEMO + source link
```

## Rules

1. **`data_origin` is a DB column with a constraint** — `REAL` or `SYNTHETIC_DEMO`, never null, never free text.
2. **Mixed origin is split at load**, never blended into one table silently.
3. **RAG chunks carry their parents' provenance** — a retrieved chunk surfaces `source`, `authority`, `source_url`, `published_date` (contract `RagQueryResponse`).
4. **LLM answers cite chunk ids** — the officer can click through to the original document.
5. **No synthetic value may masquerade as real** in any response: if the backing row is `SYNTHETIC_DEMO`, the response says so.

## Why this wins the judge question

> *"How do we know this flood zone is real?"*

Answer in the product: the row is labelled, the evidence card shows the source and date, and if we don't have real data we show `SYNTHETIC_DEMO` — deliberately, visibly, everywhere. A fabricated-looking map is the one thing AVASYA refuses to produce.
