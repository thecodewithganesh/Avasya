"""CLI: python -m backend.rag — (re)build the document_chunks corpus.

Used by docker-compose bootstrap (after seed_demo) and by operators to
re-index after real evidence ingestion. Idempotent: unchanged chunks are
skipped, changed ones updated, stale ones removed.
"""
from __future__ import annotations

from backend.core.database import SessionLocal
from backend.rag.embedder import get_embedder
from backend.rag.indexer import index_evidence


def main() -> None:
    db = SessionLocal()
    try:
        summary = index_evidence(db, embedder=get_embedder())
    finally:
        db.close()
    print(
        f"RAG indexing complete: created={summary.chunks_created} "
        f"updated={summary.chunks_updated} skipped={summary.chunks_skipped} "
        f"errors={len(summary.errors)} elapsed={summary.elapsed_seconds}s"
    )
    for error in summary.errors:
        print(f"  - {error}")


if __name__ == "__main__":
    main()
