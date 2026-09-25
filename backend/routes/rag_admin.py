"""RAG indexing + generation API.

- POST /rag/index  — (re)build the document_chunks corpus (idempotent)
- POST /rag/answer — full retrieval + generation: grounded, cited answer

Both are thin route wrappers over backend/rag/ (indexer.py, retriever.py,
generator.py) — no second RAG implementation lives here.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core.database import get_db
from backend.rag.embedder import get_embedder
from backend.rag.indexer import index_evidence
from backend.rag.schemas import IndexSummary, RetrievalRequest

router = APIRouter(prefix="/api/v1/rag", tags=["AVASYA Intelligence"])


class RagIndexRequest(BaseModel):
    habitation_id: int | None = None
    batch_size: int = 50


class RagAnswerRequest(BaseModel):
    question: str
    top_k: int = 5
    evidence_type: str | None = None
    habitation_id: int | None = None


@router.post(
    "/index",
    summary="(Re)build the RAG retrieval corpus from persisted evidence rows (idempotent)",
)
def rag_index(
    request: RagIndexRequest | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    payload = request or RagIndexRequest()
    try:
        embedder = get_embedder()
    except Exception as exc:
        # Unknown provider or unloadable model — honest failure, no fabrication.
        raise HTTPException(
            status_code=503,
            detail={
                "integration_pending": True,
                "message": f"Embedder unavailable: {exc}",
            },
        ) from exc

    try:
        summary: IndexSummary = index_evidence(
            db,
            embedder=embedder,
            batch_size=max(1, payload.batch_size),
            habitation_id=payload.habitation_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {exc}") from exc

    body = summary.model_dump()
    body["has_errors"] = summary.has_errors
    body["total_processed"] = summary.total_processed
    return body


@router.post(
    "/answer",
    summary="Full RAG query: grounded, cited answer composed from retrieved evidence chunks",
)
def rag_answer(
    request: RagAnswerRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    from backend.models import DocumentChunk
    from sqlalchemy import func, select

    corpus = int(
        db.scalar(
            select(func.count(DocumentChunk.id)).where(
                DocumentChunk.embedding.is_not(None)
            )
        )
        or 0
    )
    if corpus == 0:
        raise HTTPException(
            status_code=503,
            detail={
                "integration_pending": True,
                "message": "RAG corpus is empty. Run POST /api/v1/rag/index first.",
            },
        )

    from backend.rag.generator import generate
    from backend.rag.retriever import retrieve

    retrieval = retrieve(
        db,
        RetrievalRequest(
            query_text=request.question,
            top_k=request.top_k,
            habitation_id=request.habitation_id,
            evidence_type=request.evidence_type,
        ),
    )
    # A habitation-scoped request must carry its structured AVASYA result into
    # the LLM path.  A general corpus question deliberately has no fabricated
    # habitation context.
    structured_context = None
    if request.habitation_id is not None:
        from ai.llm.context_builder import build_structured_context

        try:
            structured_context = build_structured_context(db, request.habitation_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
    answer = generate(retrieval, structured_context=structured_context)
    return answer.to_dict()
