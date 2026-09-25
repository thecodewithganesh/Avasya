from __future__ import annotations

from typing import Any, Optional

from backend.models.evidence import Evidence
from backend.rag.schemas import ChunkRecord, EvidenceChunkSource

# ---------------------------------------------------------------------------
# Chunking configuration
# ---------------------------------------------------------------------------

# Maximum characters per chunk. Chosen to fit comfortably inside most
# embedding model context limits (~512 tokens ≈ ~2 000 chars) while leaving
# room for the query text. Lowering this creates more, shorter chunks;
# raising it creates fewer, longer chunks. Both affect retrieval quality.
MAX_CHUNK_CHARS: int = 1_500

# Minimum characters for a chunk to be worth indexing. Avoids storing
# nearly-empty chunks that would pollute retrieval results.
MIN_CHUNK_CHARS: int = 20


# ---------------------------------------------------------------------------
# Internal text extraction helpers
# ---------------------------------------------------------------------------


def _extract_evidence_text(evidence: Evidence) -> str:
    """
    Build a single readable string from one Evidence row.

    Field priority (most to least important for retrieval):
      1. summary        — free-text narrative, most useful for embedding
      2. evidence_type  — label context ("flood", "roads", …)
      3. source_name    — provenance label
      4. source_type    — document type ("report", "satellite", …)
      5. evidence_payload fields — structured data, extracted if readable

    None values are silently skipped so the function never raises.
    The resulting text is what will be embedded and stored in document_chunks.
    """
    parts: list[str] = []

    if evidence.evidence_type:
        parts.append(f"Evidence type: {evidence.evidence_type}")
    if evidence.source_type:
        parts.append(f"Source type: {evidence.source_type}")
    if evidence.source_name:
        parts.append(f"Source: {evidence.source_name}")
    if evidence.summary:
        parts.append(evidence.summary)

    # Extract readable string values from structured JSON payload.
    # Only well-known narrative keys are extracted — numeric/date fields
    # are not embedded because they don't help semantic retrieval.
    if evidence.evidence_payload and isinstance(evidence.evidence_payload, dict):
        for key in ("description", "notes", "details", "summary", "text", "narrative"):
            value = evidence.evidence_payload.get(key)
            if isinstance(value, str) and value.strip():
                parts.append(value.strip())

    return "\n".join(parts).strip()


def _split_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    """
    Split a string into chunks of at most ``max_chars`` characters.

    Strategy (in order):
      1. If text fits in one chunk, return it as-is.
      2. Split at double-newlines (paragraph boundaries) and pack
         paragraphs greedily into chunks.
      3. If a single paragraph exceeds ``max_chars``, hard-split it.

    This is intentionally a simple, dependency-free splitter.
    When the LLM provider is confirmed and tiktoken is added, this can be
    upgraded to token-aware splitting without changing the public interface.
    """
    if len(text) <= max_chars:
        return [text] if text.strip() else []

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    current: str = ""

    for para in paragraphs:
        joined_len = len(current) + (2 if current else 0) + len(para)
        if joined_len <= max_chars:
            current = (current + "\n\n" + para).strip() if current else para
        else:
            if current:
                chunks.append(current)
            if len(para) > max_chars:
                # Hard-split an oversize paragraph at max_chars boundaries
                for i in range(0, len(para), max_chars):
                    piece = para[i : i + max_chars].strip()
                    if piece:
                        chunks.append(piece)
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def chunk_evidence(evidence: Evidence) -> list[ChunkRecord]:
    """
    Parse one ``Evidence`` row into zero or more ``ChunkRecord`` objects.

    Returns an empty list if the row has no usable text (all narrative
    fields are None/empty). The caller (indexer.py) handles empty returns
    by skipping the row rather than writing an empty chunk.

    This is a pure function: no DB access, no file I/O, no side effects.
    It can be unit-tested without a running database.

    Args:
        evidence: A hydrated ``Evidence`` ORM instance.

    Returns:
        Ordered list of ``ChunkRecord`` objects (chunk_index 0, 1, 2, …).
    """
    full_text = _extract_evidence_text(evidence)
    if not full_text or len(full_text) < MIN_CHUNK_CHARS:
        return []

    text_chunks = _split_text(full_text)

    source = EvidenceChunkSource(
        source_table="evidence",
        source_id=evidence.id,
        habitation_id=evidence.habitation_id,
        evidence_type=evidence.evidence_type,
    )

    return [
        ChunkRecord(
            chunk_index=idx,
            text=chunk,
            source=source,
            # Store provenance metadata so the retriever can surface it
            # without joining back to the evidence table. data_origin is
            # carried through so a SYNTHETIC_DEMO chunk can never be
            # relabelled downstream (audit Part C / Part 28).
            metadata={
                "source_name": evidence.source_name,
                "source_url": evidence.source_url,
                "external_reference": evidence.external_reference,
                "hazard_id": evidence.hazard_id,
                "risk_assessment_id": evidence.risk_assessment_id,
                "data_origin": evidence.data_origin.value
                if hasattr(evidence.data_origin, "value")
                else str(evidence.data_origin),
                "verification": None,  # not tracked on evidence rows yet — honest null
            },
        )
        for idx, chunk in enumerate(text_chunks)
    ]
