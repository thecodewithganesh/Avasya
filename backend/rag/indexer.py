from __future__ import annotations

"""
RAG indexing pipeline for the AVASYA project.

Responsibility
--------------
Read ``Evidence`` rows from the database → chunk them (via chunker.py) →
embed them (via embedder.py) → upsert into ``document_chunks``.

This module is the only part of the RAG subsystem that writes to the
database. Everything else (chunker, embedder, retriever) is either
purely functional or read-only.

Design rules
------------
- Idempotent: re-running index_evidence() on the same data produces the
  same result. Unchanged chunks are skipped; changed chunks are updated.
- Fault-tolerant: a chunking or embedding failure for one row is logged and
  recorded in IndexSummary.errors but does not abort the rest of the run.
- No AI pipeline calls: this module does NOT call ai/pipeline.py or any
  function from the deterministic risk/recommendation engines.
"""

import logging
import time
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.document_chunk import DocumentChunk
from backend.models.evidence import Evidence
from backend.rag.chunker import chunk_evidence
from backend.rag.embedder import Embedder, get_embedder
from backend.rag.schemas import ChunkRecord, IndexSummary

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _upsert_chunk(
    db: Session,
    record: ChunkRecord,
    embedding: list[float],
) -> tuple[bool, bool]:
    """
    Insert or update a DocumentChunk row.

    Keyed on the unique index (source_table, source_id, chunk_index).
    If the row exists and the text is unchanged and an embedding is already
    stored, the row is skipped (returns ``(False, False)``).

    Returns:
        (was_created, was_updated) — exactly one is True unless skipped.
    """
    existing = db.scalar(
        select(DocumentChunk).where(
            DocumentChunk.source_table == record.source.source_table,
            DocumentChunk.source_id == record.source.source_id,
            DocumentChunk.chunk_index == record.chunk_index,
        )
    )

    if existing is not None:
        # Skip if content and embedding are both current
        if existing.text == record.text and existing.embedding is not None:
            return False, False  # skipped — no changes needed

        existing.text = record.text
        existing.embedding = embedding
        existing.habitation_id = record.source.habitation_id
        existing.evidence_type = record.source.evidence_type
        existing.chunk_metadata = record.metadata
        return False, True  # updated

    chunk = DocumentChunk(
        source_table=record.source.source_table,
        source_id=record.source.source_id,
        chunk_index=record.chunk_index,
        text=record.text,
        embedding=embedding,
        habitation_id=record.source.habitation_id,
        evidence_type=record.source.evidence_type,
        chunk_metadata=record.metadata,
    )
    db.add(chunk)
    return True, False  # created


def _remove_stale_chunks(
    db: Session,
    source_table: str,
    source_id: int,
    valid_indices: set[int],
) -> None:
    """
    Delete DocumentChunk rows for a given source row whose chunk_index is
    no longer in ``valid_indices``. This handles the case where re-chunking
    a source row produces fewer chunks than the previous run (e.g. because
    the summary was shortened).
    """
    all_chunks = list(
        db.scalars(
            select(DocumentChunk).where(
                DocumentChunk.source_table == source_table,
                DocumentChunk.source_id == source_id,
            )
        ).all()
    )
    for chunk in all_chunks:
        if chunk.chunk_index not in valid_indices:
            db.delete(chunk)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def index_evidence(
    db: Session,
    embedder: Optional[Embedder] = None,
    batch_size: int = 50,
    habitation_id: Optional[int] = None,
) -> IndexSummary:
    """
    Index all Evidence rows into document_chunks.

    Pipeline per row:
        Evidence row → chunk_evidence() → list[ChunkRecord]
        ChunkRecord list → embedder.embed() → list[vector]
        (ChunkRecord, vector) pairs → _upsert_chunk() → document_chunks

    Args:
        db: SQLAlchemy session. The caller is responsible for managing its
            lifecycle (opened before this call, closed after).
        embedder: Embedder to use. Defaults to ``get_embedder()``, which
            currently returns ``NullEmbedder``. Pass a real embedder once
            the LLM provider is confirmed.
        batch_size: Number of chunks to embed per API/model call. Larger
            batches are more efficient but use more memory.
        habitation_id: If set, index only the Evidence rows linked to this
            specific habitation (useful for incremental re-indexing after
            new evidence is ingested for one area).

    Returns:
        ``IndexSummary`` with counts of created/updated/skipped chunks and
        any per-row errors that occurred.
    """
    if embedder is None:
        embedder = get_embedder()

    summary = IndexSummary(source_table="evidence")
    t_start = time.monotonic()

    # ---- Fetch evidence rows -----------------------------------------------
    query = select(Evidence)
    if habitation_id is not None:
        query = query.where(Evidence.habitation_id == habitation_id)

    evidence_rows = list(db.scalars(query).all())
    logger.info(
        "RAG indexer: processing %d evidence rows (habitation_id=%s)",
        len(evidence_rows),
        habitation_id,
    )

    # ---- Chunk all rows first (pure, fast) ----------------------------------
    all_pairs: list[tuple[int, ChunkRecord]] = []  # (evidence.id, record)
    valid_indices_per_source: dict[int, set[int]] = {}

    for ev in evidence_rows:
        try:
            records = chunk_evidence(ev)
        except Exception as exc:
            msg = f"Chunking failed for evidence id={ev.id}: {exc}"
            summary.errors.append(msg)
            logger.exception("RAG indexer: %s", msg)
            continue

        valid_indices_per_source[ev.id] = {r.chunk_index for r in records}
        for record in records:
            all_pairs.append((ev.id, record))

    logger.info("RAG indexer: %d chunks produced from %d rows", len(all_pairs), len(evidence_rows))

    # ---- Embed in batches and upsert ----------------------------------------
    for batch_start in range(0, len(all_pairs), batch_size):
        batch = all_pairs[batch_start : batch_start + batch_size]
        texts = [record.text for _, record in batch]

        try:
            embeddings = embedder.embed(texts)
        except Exception as exc:
            for ev_id, record in batch:
                msg = (
                    f"Embedding failed for evidence id={ev_id}, "
                    f"chunk={record.chunk_index}: {exc}"
                )
                summary.errors.append(msg)
            logger.exception(
                "RAG indexer: embedding batch starting at %d failed", batch_start
            )
            continue

        if len(embeddings) != len(batch):
            msg = (
                f"Embedder returned {len(embeddings)} vectors for "
                f"{len(batch)} inputs — batch starting at {batch_start} skipped."
            )
            summary.errors.append(msg)
            logger.error("RAG indexer: %s", msg)
            continue

        for (ev_id, record), embedding in zip(batch, embeddings):
            try:
                created, updated = _upsert_chunk(db, record, embedding)
                if created:
                    summary.chunks_created += 1
                elif updated:
                    summary.chunks_updated += 1
                else:
                    summary.chunks_skipped += 1
            except Exception as exc:
                msg = f"Upsert failed for evidence id={ev_id}, chunk={record.chunk_index}: {exc}"
                summary.errors.append(msg)
                logger.exception("RAG indexer: %s", msg)

    # ---- Remove stale chunks (idempotency cleanup) --------------------------
    for source_id, valid_indices in valid_indices_per_source.items():
        try:
            _remove_stale_chunks(db, "evidence", source_id, valid_indices)
        except Exception as exc:
            msg = f"Stale-chunk removal failed for evidence id={source_id}: {exc}"
            summary.errors.append(msg)
            logger.exception("RAG indexer: %s", msg)

    db.commit()

    summary.elapsed_seconds = round(time.monotonic() - t_start, 3)
    logger.info(
        "RAG indexer complete: created=%d updated=%d skipped=%d errors=%d elapsed=%.3fs",
        summary.chunks_created,
        summary.chunks_updated,
        summary.chunks_skipped,
        len(summary.errors),
        summary.elapsed_seconds,
    )
    return summary
