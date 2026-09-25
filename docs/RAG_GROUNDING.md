# AVASYA RAG Grounding Specification

This document defines the architecture, model specifications, retrieval conventions, and boundaries of the AVASYA Retrieval-Augmented Generation (RAG) subsystem.

---

## 1. Overview & Core Mission

The AVASYA RAG subsystem provides grounding evidence retrieval for disaster management, climate risk, and habitation relocation decisions.

> [!IMPORTANT]
> **Boundary & Scope:**
> - **RAG retrieves evidence only**: It extracts, indexes, and retrieves authoritative text evidence from field surveys, sensor records, hazard studies, and official recommendations.
> - **No Decision Logic in RAG**: RAG does **NOT** calculate risk scores, determine shelter capacities, optimize relocation routes, or assign evacuation priorities. All analytical decision engines remain isolated under `ai/` and P3 backend services.
> - **No Direct Generation yet**: Retrieval outputs ranked text chunks with similarity scores. Generation (`/rag/query`) is an upcoming integration layer that feeds retrieved chunks into a prompt context.

---

## 2. Embedding Model Specification

- **Model Identifier**: `intfloat/multilingual-e5-small`
- **Output Dimensionality**: `384`
- **Framework**: Sentence Transformers (`sentence-transformers`) / PyTorch
- **Vector Dimension Verification**: Verified via modern `SentenceTransformer.get_embedding_dimension()` (returns `384`).
- **Offline / Local Execution**: Runs locally without external API dependencies or API keys.

### Local Model Storage & Git Policy
- **Local Directory**: `models/multilingual-e5-small`
- **Git Policy**: Model weights and large binary files are **strictly excluded from Git** (`.gitignore` ignores `models/` / `.safetensors` / checkpoints).
- **Standalone Docker Deployment**: In production and containerized environments, the model directory should be mounted via a persistent volume or cached host mount (`/models` / `HF_HOME`) to avoid re-downloading weights on container restarts.

---

## 3. E5 Retrieval Prefix Convention

The `multilingual-e5-small` model requires asymmetric task-specific prefixes for passages and queries. The embedding layer automatically handles this formatting:

| Content Type | Prefix Format | Applied In | Purpose |
| :--- | :--- | :--- | :--- |
| **Document Passages** | `passage: <chunk_text>` | `embed_passages()` / `index_evidence()` | Indexes authoritative document and evidence chunks into vector space. |
| **Search Queries** | `query: <user_query>` | `embed_query()` / `retrieve()` | Transforms natural-language search queries for cosine similarity comparison. |

---

## 4. Vector Storage & PostgreSQL + pgvector

All document chunks and vector representations are stored in PostgreSQL with the `pgvector` extension enabled.

### Table Schema: `document_chunks`

| Column | Type | Nullable | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `NO` | Primary key (autoincrement). |
| `source_table` | `VARCHAR(100)` | `NO` | Source table provenance (`"evidence"`, `"recommendations"`). |
| `source_id` | `INTEGER` | `NO` | Primary key ID in the source table. |
| `chunk_index` | `INTEGER` | `NO` | 0-based chunk position in source document. |
| `text` | `TEXT` | `NO` | Chunk text content. |
| `embedding` | `vector(384)` | `YES` | 384-dimensional L2-normalized float vector. |
| `habitation_id` | `INTEGER` | `YES` | Denormalized habitation ID for indexed filtering. |
| `evidence_type` | `VARCHAR(120)` | `YES` | Denormalized evidence type (e.g., `'flood'`, `'drought'`). |
| `chunk_metadata` | `JSON` | `YES` | Provenance metadata (source URL, title, tags). |
| `created_at` | `TIMESTAMPTZ` | `NO` | Timestamp of creation (`now()`). |
| `updated_at` | `TIMESTAMPTZ` | `NO` | Timestamp of last update (`now()`). |

### Indexes
1. **Idempotent Unique Index**: `ix_document_chunks_source_table_source_id_chunk_index` on `(source_table, source_id, chunk_index)`. Ensures re-indexing is fully idempotent.
2. **HNSW Vector Index**: `ix_document_chunks_embedding_hnsw` on `embedding vector_cosine_ops` with parameters `(m = 16, ef_construction = 64)`.
3. **Filter B-Tree Indexes**: `ix_document_chunks_habitation_id` and `ix_document_chunks_evidence_type`.

---

## 5. Retrieval & Similarity Ranking

- **Metric**: Cosine Distance via pgvector `<=>` operator.
- **Score Normalization**: Similarity score is normalized to $[0.0, 1.0]$ via $1.0 - \text{distance} / 2.0$.
- **Filtering**: Optional `habitation_id` and `evidence_type` filters narrow the search space prior to distance ordering.

---

## 6. Configuration

RAG settings are configured via `backend/rag/config.py` with environment variable overrides:

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `EMBEDDING_PROVIDER` | `huggingface` | Embedding backend (`"huggingface"` or `"null"`). |
| `EMBEDDING_MODEL` | `intfloat/multilingual-e5-small` | Model identifier. |
| `EMBEDDING_DIMENSION` | `384` | Output vector size. |
| `EMBEDDING_MODEL_PATH` | `models/multilingual-e5-small` | Path to local model directory. |
| `EMBEDDING_BATCH_SIZE` | `32` | Batch size for embedding encode calls. |
| `EMBEDDING_NORMALIZE` | `true` | Enables L2 vector normalization. |

---

## 7. Future `/rag/query` API Integration

When the generative LLM pipeline is connected:
1. User invokes `/rag/query` with question + optional habitation/hazard filters.
2. `retriever.retrieve()` fetches top-$K$ grounded evidence chunks using 384-dim E5 cosine search.
3. Chunks are formatted into structured context blocks (with citations to `source_table`, `source_id`, `habitation_id`).
4. Generative LLM produces a grounded response with strict source citations.
