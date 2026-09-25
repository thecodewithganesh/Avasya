from __future__ import annotations

"""
AVASYA RAG Subsystem
====================

Pipeline overview
-----------------

  [Indexing — offline / on ingestion]
  Evidence table (PostgreSQL)
      → chunker.chunk_evidence()       pure function, no DB
      → embedder.get_embedder().embed()  NullEmbedder now; real provider TBD
      → indexer.index_evidence()       upserts into document_chunks table

  [Retrieval — on request]
  User query (text)
      → embedder.get_embedder().embed()
      → retriever.retrieve()           pgvector cosine similarity search
      → RetrievalResponse              ranked chunks (no LLM answer yet)

  [Generation — FUTURE INTEGRATION POINT]
  RetrievalResponse
      → generator.generate()           (not yet created)
      → LLM prompt + context
      → natural-language answer

Current status
--------------
- Chunking, embedding interface, indexing, and retrieval are implemented.
- NullEmbedder is active — returns zero vectors. Replace via get_embedder()
  once the LLM provider is selected.
- The LLM generation layer (generator.py) is explicitly deferred pending
  LLM provider selection.

Coordination required with P3
------------------------------
- Alembic must be initialized and a migration run to CREATE TABLE
  document_chunks and ENABLE the pgvector extension before index_evidence()
  can write to the DB.
- See database/migrations/ (currently empty — awaiting Alembic init owner).
"""

from backend.rag.chunker import chunk_evidence
from backend.rag.embedder import EMBEDDING_DIM, Embedder, NullEmbedder, get_embedder
from backend.rag.indexer import index_evidence
from backend.rag.retriever import retrieve
from backend.rag.schemas import (
    ChunkRecord,
    EvidenceChunkSource,
    IndexSummary,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
)

__all__ = [
    # Chunker
    "chunk_evidence",
    # Embedder
    "EMBEDDING_DIM",
    "Embedder",
    "NullEmbedder",
    "get_embedder",
    # Indexer
    "index_evidence",
    # Retriever
    "retrieve",
    # Schemas
    "ChunkRecord",
    "EvidenceChunkSource",
    "IndexSummary",
    "RetrievalRequest",
    "RetrievalResponse",
    "RetrievalResult",
]
