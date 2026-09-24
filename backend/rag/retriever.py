from __future__ import annotations

"""
RAG retrieval layer for the AVASYA project.

Responsibility
--------------
Embed a natural-language query and return the top-K most semantically
similar document chunks from the ``document_chunks`` table using pgvector's
cosine distance operator.

This module is READ-ONLY with respect to the database. It never writes to
any table (indexing is handled by indexer.py).

FUTURE INTEGRATION POINT — LLM generation
------------------------------------------
This module returns a ``RetrievalResponse`` containing the raw retrieved
chunks. It does NOT call any LLM. The generation step will be implemented
in ``backend/rag/generator.py`` (not yet created) once the LLM provider is
confirmed. That module will:
  1. Receive a ``RetrievalResponse`` from this function.
  2. Format the chunks into a prompt context string.
  3. Call the chosen LLM and return a natural-language answer.
"""

import logging
from typing import Optional

from sqlalchemy import func, select  # type: ignore
from sqlalchemy.orm import Session  # type: ignore

from backend.models.document_chunk import DocumentChunk
from backend.rag.embedder import Embedder, get_embedder
from backend.rag.schemas import (
    EvidenceChunkSource,
    RetrievalRequest,
    RetrievalResponse,
    RetrievalResult,
)

logger = logging.getLogger(__name__)


def retrieve(
    db: Session,
    request: RetrievalRequest,
    embedder: Optional[Embedder] = None,
) -> RetrievalResponse:
    """
    Embed the query and return the top-K most similar indexed chunks.

    Similarity metric: cosine similarity (via pgvector ``<=>`` operator).
    Higher score = more similar to the query (1.0 = identical, 0.0 = orthogonal).

    Optional filters (``habitation_id``, ``evidence_type``) are applied
    before the similarity ranking so the search space can be narrowed to
    evidence relevant to a specific location or hazard type.

    NOTE: This function returns only the retrieved chunks — it does NOT
    generate a natural-language answer. The answer step is a future
    integration point (see module docstring above).

    Args:
        db: Read-only SQLAlchemy session.
        request: ``RetrievalRequest`` with query text, top_k, and optional filters.
        embedder: Embedder to use. Defaults to ``get_embedder()``.

    Returns:
        ``RetrievalResponse`` with ranked results and corpus-size metadata.
    """
    if embedder is None:
        embedder = get_embedder()

    # ---- Embed the query ----------------------------------------------------
    try:
        if hasattr(embedder, "embed_query"):
            query_vector = embedder.embed_query(request.query_text)
        elif hasattr(embedder, "embed_queries"):
            query_embeddings = embedder.embed_queries([request.query_text])
            query_vector = query_embeddings[0] if query_embeddings else []
        else:
            query_embeddings = embedder.embed([request.query_text])
            query_vector = query_embeddings[0] if query_embeddings else []
    except Exception as exc:
        logger.error("RAG retriever: embedding query failed: %s", exc)
        return RetrievalResponse(
            query_text=request.query_text,
            results=[],
            total_chunks_searched=0,
        )

    if not query_vector:
        logger.error("RAG retriever: embedder returned empty result for query")
        return RetrievalResponse(
            query_text=request.query_text,
            results=[],
            total_chunks_searched=0,
        )

    # ---- Build the similarity search query ----------------------------------
    # pgvector's ``cosine_distance`` returns values in [0, 2]:
    #   0 = identical vectors, 2 = opposite vectors.
    # We convert to similarity in [0, 1] as: similarity = 1 - distance / 2.
    #
    # The ``<=>`` operator is PostgreSQL/pgvector-only. On non-Postgres
    # dialects (the in-memory SQLite unit-test stack, mirroring the Geometry
    # flattening precedent in tests/conftest.py) we fall back to loading the
    # embedded rows and ranking them in Python with the same metric. The
    # production path (Alembic/Postgres) always uses the pgvector operator.
    if db.get_bind().dialect.name != "postgresql":
        rows_raw = list(
            db.scalars(
                select(DocumentChunk).where(DocumentChunk.embedding.is_not(None))
            ).all()
        )
        return _python_ranked_response(db, request, query_vector, rows_raw)

    distance_expr = DocumentChunk.embedding.cosine_distance(query_vector).label("distance")

    stmt = (
        select(DocumentChunk, distance_expr)
        .where(DocumentChunk.embedding.is_not(None))
        # NULL distances (zero vectors) sort last so real matches win.
        .order_by(distance_expr.asc().nulls_last())
        .limit(request.top_k)
    )

    if request.habitation_id is not None:
        stmt = stmt.where(DocumentChunk.habitation_id == request.habitation_id)

    if request.evidence_type is not None:
        stmt = stmt.where(DocumentChunk.evidence_type == request.evidence_type)

    # ---- Count total indexed chunks (for diagnostics) -----------------------
    count_stmt = select(func.count(DocumentChunk.id)).where(
        DocumentChunk.embedding.is_not(None)
    )
    if request.habitation_id is not None:
        count_stmt = count_stmt.where(
            DocumentChunk.habitation_id == request.habitation_id
        )
    if request.evidence_type is not None:
        count_stmt = count_stmt.where(
            DocumentChunk.evidence_type == request.evidence_type
        )
    total_indexed: int = db.scalar(count_stmt) or 0

    # ---- Execute and build results ------------------------------------------
    rows = db.execute(stmt).all()

    # HNSW caveat: zero vectors (NullEmbedder stub) are unreachable in the
    # index graph — an index-ordered scan on a stub corpus legitimately
    # returns 0 rows even though the corpus is non-empty. Degrade to the
    # Python ranking path (NaN normalised to similarity 0.0) instead of
    # pretending the corpus is empty.
    if not rows and total_indexed > 0:
        rows_raw = list(
            db.scalars(
                select(DocumentChunk).where(DocumentChunk.embedding.is_not(None))
            ).all()
        )
        return _python_ranked_response(db, request, query_vector, rows_raw)

    results: list[RetrievalResult] = []
    for chunk, raw_distance in rows:
        # Clamp to [0, 1] — NullEmbedder produces NaN distances (zero vectors),
        # which we normalise to 0.0 so the response schema stays valid.
        try:
            dist_float = float(raw_distance)
            score = max(0.0, min(1.0, 1.0 - dist_float / 2.0))
        except (TypeError, ValueError):
            # NaN or None distance (happens with zero vectors from NullEmbedder)
            score = 0.0

        results.append(
            RetrievalResult(
                chunk_id=chunk.id,
                text=chunk.text,
                score=score,
                source=EvidenceChunkSource(
                    source_table=chunk.source_table,
                    source_id=chunk.source_id,
                    habitation_id=chunk.habitation_id,
                    evidence_type=chunk.evidence_type,
                ),
                metadata=chunk.chunk_metadata or {},
            )
        )

    logger.info(
        "RAG retriever: returned %d/%d chunks for query (top_k=%d)",
        len(results),
        total_indexed,
        request.top_k,
    )

    return RetrievalResponse(
        query_text=request.query_text,
        results=results,
        total_chunks_searched=total_indexed,
    )


def _python_ranked_response(
    db: Session,
    request: RetrievalRequest,
    query_vector: list[float],
    rows: list[DocumentChunk],
) -> RetrievalResponse:
    """Non-Postgres fallback: rank embedded rows in Python by cosine.

    Mirrors the SQL path's semantics (same [0, 1] similarity mapping, same
    filters, same empty-corpus behaviour) without the pgvector operator.
    Never used in production (Alembic/Postgres always runs the operator).
    """
    import math

    filtered = [
        chunk
        for chunk in rows
        if (request.habitation_id is None or chunk.habitation_id == request.habitation_id)
        and (request.evidence_type is None or chunk.evidence_type == request.evidence_type)
    ]
    total = len(filtered)

    q_norm = math.sqrt(sum(v * v for v in query_vector)) or 1.0
    scored: list[tuple[float, DocumentChunk]] = []
    for chunk in filtered:
        vector = chunk.embedding if chunk.embedding is not None else []
        if len(vector) != len(query_vector):
            continue
        dot = sum(a * b for a, b in zip(query_vector, vector))
        v_norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        if q_norm == 0.0 or v_norm == 0.0:
            similarity = 0.0  # zero vectors (NullEmbedder) are orthogonal to everything
        else:
            similarity = max(0.0, min(1.0, dot / (q_norm * v_norm)))
        scored.append((similarity, chunk))

    scored.sort(key=lambda pair: pair[0], reverse=True)

    results = [
        RetrievalResult(
            chunk_id=chunk.id,
            text=chunk.text,
            score=round(similarity, 6),
            source=EvidenceChunkSource(
                source_table=chunk.source_table,
                source_id=chunk.source_id,
                habitation_id=chunk.habitation_id,
                evidence_type=chunk.evidence_type,
            ),
            metadata=chunk.chunk_metadata or {},
        )
        for similarity, chunk in scored[: request.top_k]
    ]
    return RetrievalResponse(
        query_text=request.query_text,
        results=results,
        total_chunks_searched=total,
    )
