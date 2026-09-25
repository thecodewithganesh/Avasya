from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Chunk-level types
# ---------------------------------------------------------------------------


class EvidenceChunkSource(BaseModel):
    """
    Identifies exactly which DB row a chunk was extracted from.
    Included in every RetrievalResult so the caller can join back to the
    source table if more detail is needed.
    """

    source_table: str = Field(
        description="DB table the chunk came from: 'evidence', 'recommendations', etc."
    )
    source_id: int = Field(description="Primary-key value in source_table.")
    habitation_id: Optional[int] = Field(
        default=None,
        description="Denormalized from source row — None if not linked to a habitation.",
    )
    evidence_type: Optional[str] = Field(
        default=None,
        description="Denormalized evidence_type from the source row (e.g. 'flood').",
    )


class ChunkRecord(BaseModel):
    """
    A single text chunk ready to be embedded and stored in document_chunks.
    Produced by chunker.py; consumed by indexer.py.
    This is an in-memory transfer object — it is never persisted directly.
    """

    chunk_index: int = Field(ge=0, description="Zero-based position within the source document.")
    text: str = Field(min_length=1, description="The chunk text to embed.")
    source: EvidenceChunkSource
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Extra fields from the source row (source_name, source_url, etc.).",
    )


# ---------------------------------------------------------------------------
# Indexing summary
# ---------------------------------------------------------------------------


class IndexSummary(BaseModel):
    """
    Returned by indexer.index_evidence() to report what happened during
    an indexing run without requiring the caller to read logs.
    """

    source_table: str
    chunks_created: int = 0
    chunks_updated: int = 0
    chunks_skipped: int = 0
    errors: list[str] = Field(default_factory=list)
    elapsed_seconds: float = 0.0

    @property
    def has_errors(self) -> bool:
        return len(self.errors) > 0

    @property
    def total_processed(self) -> int:
        return self.chunks_created + self.chunks_updated + self.chunks_skipped


# ---------------------------------------------------------------------------
# Retrieval types
# ---------------------------------------------------------------------------


class RetrievalResult(BaseModel):
    """
    One chunk returned by the retriever, ranked by similarity to the query.
    """

    chunk_id: int = Field(description="Primary key of the document_chunks row.")
    text: str = Field(description="The chunk text (ready to pass to the LLM as context).")
    score: float = Field(
        ge=0.0,
        le=1.0,
        description="Cosine similarity in [0, 1]. 1.0 = identical to query.",
    )
    source: EvidenceChunkSource
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalRequest(BaseModel):
    """
    Input to retriever.retrieve(). All filter fields are optional — omitting
    them returns results from the full document_chunks corpus.
    """

    query_text: str = Field(min_length=1, description="Natural-language question or search phrase.")
    top_k: int = Field(default=5, ge=1, le=20, description="Number of chunks to return.")
    habitation_id: Optional[int] = Field(
        default=None,
        description="If set, only return chunks linked to this habitation.",
    )
    evidence_type: Optional[str] = Field(
        default=None,
        description="If set, only return chunks of this evidence_type (e.g. 'flood').",
    )


class RetrievalResponse(BaseModel):
    """
    Retriever output — the "retrieve" step of the RAG pipeline.

    NOTE: The ``answer`` field is deliberately absent. This response is the
    complete output of the retrieve step. The LLM "generate" step will be
    implemented in ``backend/rag/generator.py`` (not yet created) once the
    LLM provider is confirmed. That module will consume this response,
    format the chunks as context, and call the chosen LLM to produce an answer.
    """

    query_text: str
    results: list[RetrievalResult]
    total_chunks_searched: int = Field(
        description="Total indexed chunks in the corpus (for diagnostics)."
    )
