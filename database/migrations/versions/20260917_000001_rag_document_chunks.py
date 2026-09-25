"""RAG subsystem: pgvector extension and document_chunks table.

Revision ID: 20260917_000001
Revises: 20260916_000001
Create Date: 2026-09-17

Creates the retrieval corpus for the RAG module (backend/rag/):
  - enables the pgvector extension
  - document_chunks: one embedded text chunk per row, keyed uniquely on
    (source_table, source_id, chunk_index) so re-indexing is idempotent
  - a HNSW cosine index so similarity search stays fast as the corpus grows

The table matches backend/models/document_chunk.py (DocumentChunk) and the
dimension must match backend/rag/embedder.py EMBEDDING_DIM (384).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision = "20260917_000001"
down_revision = "20260916_000001"
branch_labels = None
depends_on = None

VECTOR_DIM = 384


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "document_chunks",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("source_table", sa.String(64), nullable=False),
        sa.Column("source_id", sa.Integer, nullable=False),
        sa.Column("chunk_index", sa.Integer, nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("embedding", Vector(VECTOR_DIM), nullable=True),
        sa.Column("habitation_id", sa.Integer, nullable=True),
        sa.Column("evidence_type", sa.String(120), nullable=True),
        sa.Column("chunk_metadata", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "source_table",
            "source_id",
            "chunk_index",
            name="uq_document_chunks_source_chunk",
        ),
    )
    op.create_index("ix_document_chunks_habitation_id", "document_chunks", ["habitation_id"])
    op.create_index("ix_document_chunks_evidence_type", "document_chunks", ["evidence_type"])
    # HNSW cosine index — the documented retrieval stack (docs/RAG_INTEGRATION.md,
    # frontend/types/rag.ts). Safe on an empty table; supports future corpus growth.
    op.create_index(
        "ix_document_chunks_embedding_hnsw",
        "document_chunks",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_document_chunks_embedding_hnsw", table_name="document_chunks")
    op.drop_index("ix_document_chunks_evidence_type", table_name="document_chunks")
    op.drop_index("ix_document_chunks_habitation_id", table_name="document_chunks")
    op.drop_table("document_chunks")
    # Left in place: the vector extension may be used by other objects.
