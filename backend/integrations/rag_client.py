"""Adapter for the RAG teammate's module (NOW WIRED to backend/rag/).

This file must never contain a second RAG implementation. It adapts the
teammate module that now lives at ``backend/rag/`` (chunker → embedder →
pgvector indexer → retriever) to the AVASYA integration contract
(``backend/integrations/contracts.py`` → ``RagQueryResponse``).

Contract shape (docs/RAG_INTEGRATION.md — do not change):
  POST /api/v1/rag/query  ->  { grounding_status: SUPPORTED|UNSUPPORTED,
                                results: [RagChunk, ...] }

Mapping decisions:
  - The document_chunks corpus is built from the ``evidence`` table, so the
    evidence table id is the natural ``source_id`` (prefixed "EVD-" for a
    stable string id) and ``evidence_type`` maps to the hazard_type filter.
  - Provenance metadata persisted by the indexer (source_name/source_url,
    etc.) is surfaced through RagChunk.title / source_url.
  - grounding_status is SUPPORTED only when at least one chunk is returned —
    never fabricated.
  - If the corpus is empty or the retrieval stack is genuinely unavailable
    (pgvector missing, embedder misconfigured, DB down), the adapter raises
    RagIntegrationPending so the route keeps its honest 503 semantics.
"""
from __future__ import annotations

import logging
import threading
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.integrations.contracts import RagChunk, RagQueryRequest, RagQueryResponse
from backend.models import DocumentChunk

logger = logging.getLogger(__name__)


class RagIntegrationPending(RuntimeError):
    """Raised when the RAG module is wired but cannot answer right now."""


def _get_db_session() -> Session:
    """Resolve a DB session for standalone callers (CLI, background jobs).

    Route handlers pass their own Depends(get_db) session instead, so the
    FastAPI dependency_overrides mechanism (tests wire an in-memory SQLite
    session) applies without any special casing here.
    """
    # Imported lazily so importing this module never requires a configured DB.
    from backend.core.database import SessionLocal

    return SessionLocal()


def _corpus_size(db: Session) -> int:
    return int(
        db.scalar(
            select(func.count(DocumentChunk.id)).where(
                DocumentChunk.embedding.is_not(None)
            )
        )
        or 0
    )


def _rag_query(db: Session, request: RagQueryRequest) -> RagQueryResponse:
    from backend.rag.retriever import retrieve
    from backend.rag.schemas import RetrievalRequest

    filters = request.filters
    retrieval = retrieve(
        db,
        RetrievalRequest(
            query_text=request.query,
            top_k=request.top_k,
            # The evidence corpus carries evidence_type ("flood", "coastline",
            # "historical_events", ...); the contract filter is hazard_type.
            evidence_type=filters.hazard_type,
            # state/district filters are not chunk-level columns; they are
            # accepted by the contract for future document-scoped corpora.
        ),
    )

    results: list[RagChunk] = []
    for hit in retrieval.results:
        metadata: dict[str, Any] = hit.metadata or {}
        results.append(
            RagChunk(
                chunk_id=f"EVD-{hit.source.source_id:03d}-c{hit.chunk_id}",
                text=hit.text,
                source_id=f"EVD-{hit.source.source_id:03d}",
                title=metadata.get("source_name") or f"Evidence row {hit.source.source_id}",
                authority=metadata.get("authority"),
                source_url=metadata.get("source_url"),
                page=None,
                section=metadata.get("section"),
                published_date=None,
                score=round(hit.score, 4),
            )
        )

    return RagQueryResponse(
        grounding_status="SUPPORTED" if results else "UNSUPPORTED",
        results=results,
    )


class RagClient:
    """Concrete adapter over backend/rag/. Thread-safe via a single lock."""

    _lock = threading.Lock()

    def query(self, request: RagQueryRequest, db: Session | None = None) -> RagQueryResponse:
        # db is injectable so callers (routes, tests) can share their session;
        # standalone callers get a short-lived session from SessionLocal.
        with RagClient._lock:
            owned = db is None
            db = db if db is not None else _get_db_session()
            try:
                if _corpus_size(db) == 0:
                    raise RagIntegrationPending(
                        "RAG corpus is empty. Run POST /api/v1/rag/index "
                        "(python -m backend.rag) before querying."
                    )
                return _rag_query(db, request)
            except RagIntegrationPending:
                raise
            except Exception as exc:  # retrieval stack genuinely unavailable
                logger.exception("RAG retrieval failed")
                raise RagIntegrationPending(f"RAG retrieval unavailable: {exc}") from exc
            finally:
                if owned:
                    db.close()


rag_client = RagClient()
