from __future__ import annotations

"""
RAG generation layer for the AVASYA project.

Responsibility
--------------
Turn a RetrievalResponse into a grounded, cited natural-language answer.

Two modes, chosen automatically:
  - ``llm``:      the Qwen3 runtime (ai/llm) is configured — the retrieved
                  chunks are handed to it through the existing
                  backend/integrations/llm_client bridge, which enforces the
                  AVASYA authority boundary (grounding validation, claim
                  stripping). The answer is AI-written and fully cited.
  - ``extractive``: no LLM configured — the answer is composed strictly from
                  the retrieved chunk texts (extractive summary + citations).
                  Never a fabricated sentence, so the honest "no invented
                  text" rule holds in both modes.

This closes the deferred integration point documented in retriever.py and
the module docstring in backend/rag/__init__.py: the pipeline is now
chunk → embed → index → retrieve → generate.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from backend.rag.schemas import RetrievalResponse

logger = logging.getLogger(__name__)

# Max chunks included verbatim in the extractive answer, in retrieval order.
EXTRACTIVE_MAX_CHUNKS = 3


@dataclass
class GeneratedAnswer:
    """The final officer-facing output of one RAG query."""

    question: str
    answer: str
    mode: str  # "llm" | "extractive" | "none"
    grounding_status: str  # "SUPPORTED" | "UNSUPPORTED"
    chunks_used: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.answer,
            "mode": self.mode,
            "grounding_status": self.grounding_status,
            "chunks_used": self.chunks_used,
            "warnings": self.warnings,
        }


def _chunk_view(hit: Any) -> dict[str, Any]:
    """Compact officer-facing citation view of one retrieved chunk."""
    metadata = hit.metadata or {}
    source = hit.source
    return {
        "chunk_id": f"EVD-{source.source_id:03d}-c{hit.chunk_id}",
        "source_id": f"EVD-{source.source_id:03d}",
        "title": metadata.get("source_name") or f"Evidence row {source.source_id}",
        "source_url": metadata.get("source_url"),
        "evidence_type": source.evidence_type,
        "score": round(hit.score, 4),
        "text": hit.text,
    }


def _extractive_answer(question: str, chunks: list[dict[str, Any]]) -> str:
    """Compose an answer strictly from the retrieved texts (no invention)."""
    if not chunks:
        return (
            "No evidence in the retrieval corpus matched this question, so no "
            "answer can be grounded. The officer should consult the source "
            "documents directly."
        )
    passages = []
    # Chunks included verbatim in the extractive answer, in retrieval order.
    for index, chunk in enumerate(chunks[:EXTRACTIVE_MAX_CHUNKS], start=1):
        title = chunk["title"]
        text = chunk["text"].replace("\n", " ").strip()
        passages.append(f"[{index}] {title}: {text}")
    return (
        f"Grounded in {len(chunks)} retrieved evidence chunk"
        f"{len(chunks) == 1 and '' or 's'}:\n\n" + "\n\n".join(passages)
    )


def generate(
    retrieval: RetrievalResponse,
    question: str | None = None,
    llm_client: Any = None,
    structured_context: dict[str, Any] | None = None,
) -> GeneratedAnswer:
    """Compose the final answer for a retrieval result.

    Args:
        retrieval: output of backend.rag.retriever.retrieve().
        question: the officer's question (defaults to the retrieval query).
        llm_client: optional pre-built LLM adapter (injectable for tests).
            When omitted, the shared backend.integrations.llm_client is used
            if the Qwen3 runtime is configured.
        structured_context: optional AVASYA structured values (hazard status,
            population, ...) passed through to the LLM for grounded reasoning.
    """
    question = question or retrieval.query_text
    chunks = [_chunk_view(hit) for hit in retrieval.results]
    grounded = "SUPPORTED" if chunks else "UNSUPPORTED"

    if not chunks:
        return GeneratedAnswer(
            question=question,
            answer=(
                "No evidence in the retrieval corpus matched this question, so "
                "no answer can be grounded."
            ),
            mode="none",
            grounding_status="UNSUPPORTED",
            chunks_used=[],
            warnings=["retrieval returned no chunks"],
        )

    # ---- LLM mode -----------------------------------------------------------
    client = llm_client
    if client is None:
        try:
            from backend.integrations.llm_client import llm_client as shared_client

            client = shared_client
        except Exception:  # pragma: no cover - import-time safety net
            client = None

    if client is not None and _llm_ready(client):
        try:
            from backend.integrations.contracts import LlmRequest

            response = client.explain(
                LlmRequest(
                    question=question,
                    avasya_context=structured_context or {},
                    rag_evidence=[
                        _llm_evidence_chunk(chunk) for chunk in chunks
                    ],
                )
            )
            return GeneratedAnswer(
                question=question,
                answer=response.answer,
                mode="llm",
                grounding_status=grounded,
                chunks_used=chunks,
                warnings=[],
            )
        except Exception:
            logger.exception("LLM generation failed; serving extractive answer")
            warnings = ["LLM generation failed; served extractive answer"]
    else:
        warnings = []

    # ---- Extractive mode (no LLM configured or LLM failed) ------------------
    return GeneratedAnswer(
        question=question,
        answer=_extractive_answer(question, chunks),
        mode="extractive",
        grounding_status=grounded,
        chunks_used=chunks,
        warnings=warnings,
    )


def _llm_ready(client: Any) -> bool:
    """True when the Qwen3 runtime behind the adapter is configured.

    Reads the wrapped LlmService directly (single availability check, no
    wasted inference). Injected test stubs without a ``_service`` are
    treated as ready — they exist precisely to exercise the LLM path.
    """
    service = getattr(client, "_service", None)
    if service is not None and hasattr(service, "is_available"):
        return bool(service.is_available())
    return hasattr(client, "explain")


def _llm_evidence_chunk(chunk: dict[str, Any]) -> Any:
    from backend.integrations.contracts import RagChunk

    return RagChunk(
        chunk_id=chunk["chunk_id"],
        text=chunk["text"],
        source_id=chunk["source_id"],
        title=chunk["title"],
        source_url=chunk.get("source_url"),
        score=chunk["score"],
    )
