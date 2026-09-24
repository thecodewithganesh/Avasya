from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pgvector.sqlalchemy import Vector
from sqlalchemy import JSON, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base

# Must match backend/rag/embedder.py EMBEDDING_DIM and the Alembic migration
# column size (database/migrations/versions/20260917_000001_rag_document_chunks.py).
VECTOR_DIM = 384


class DocumentChunk(Base):
    """One embedded chunk of evidence text (RAG retrieval corpus).

    Owned by the RAG subsystem (backend/rag/): the indexer upserts rows here,
    the retriever reads them with pgvector cosine distance. Chunks are
    reproducible from the ``evidence`` table, so the table is safe to drop and
    re-index at any time.
    """

    __tablename__ = "document_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source_table: Mapped[str] = mapped_column(String(64), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(VECTOR_DIM), nullable=True)
    habitation_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    evidence_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    chunk_metadata: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        # Upsert key used by the indexer: one row per (source row, chunk index).
        Index(
            "uq_document_chunks_source_chunk",
            "source_table",
            "source_id",
            "chunk_index",
            unique=True,
        ),
    )
