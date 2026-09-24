from __future__ import annotations

"""
Embedder interface and implementations for the AVASYA RAG subsystem.

Supported Backends:
-------------------
1. HuggingFaceEmbedder (default / production):
   Uses the local SentenceTransformer model `intfloat/multilingual-e5-small`
   (384 dimensions). Formats document chunks with the "passage: " prefix and
   search queries with the "query: " prefix according to E5 retrieval conventions.
   Embeddings are L2-normalized so that cosine distance aligns with dot product.

2. NullEmbedder (testing / stub):
   Returns zero vectors of dimension 384. Allows pipeline structure, schema,
   and SQL to be tested in environments where ML packages or model files are
   not available.

Architecture:
-------------
``Embedder`` is a ``runtime_checkable`` Protocol. Any class implementing:
  - ``embed(texts: list[str]) -> list[list[float]]``
  - ``dimension: int`` property
satisfies the protocol at runtime.
"""

import logging
import threading
from pathlib import Path
from typing import Optional, Protocol, runtime_checkable

from backend.rag.config import rag_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Canonical vector dimension for the entire AVASYA RAG subsystem.
# Must match DocumentChunk.VECTOR_DIM and Alembic migration column size.
# ---------------------------------------------------------------------------
EMBEDDING_DIM: int = 384


# ---------------------------------------------------------------------------
# E5 Prefix Helpers
# ---------------------------------------------------------------------------


def format_passage(text: str) -> str:
    """Apply the E5 passage prefix if not already present."""
    if text.startswith("passage: "):
        return text
    return f"passage: {text}"


def format_query(text: str) -> str:
    """Apply the E5 query prefix if not already present."""
    if text.startswith("query: "):
        return text
    return f"query: {text}"


# ---------------------------------------------------------------------------
# Protocol (interface contract)
# ---------------------------------------------------------------------------


@runtime_checkable
class Embedder(Protocol):
    """
    Interface contract for all embedding backends.

    Any class that has:
        - ``embed(texts: list[str]) -> list[list[float]]``
        - ``dimension: int`` property

    satisfies this Protocol at runtime (``isinstance(obj, Embedder)`` -> True).

    Implementors must be thread-safe.
    Never raise for empty input — return an empty list instead.
    Vector length must equal ``self.dimension`` for every returned vector.
    """

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of texts (defaults to passage mode for indexed docs).

        Args:
            texts: List of strings.

        Returns:
            List of float vectors, one per input text, each of length ``self.dimension``.
        """
        ...

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of document chunks/passages with 'passage: ' prefix."""
        ...

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        """Embed a batch of search queries with 'query: ' prefix."""
        ...

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query with 'query: ' prefix."""
        ...

    @property
    def dimension(self) -> int:
        """Output vector dimensionality."""
        ...


# ---------------------------------------------------------------------------
# HuggingFaceEmbedder — multilingual-e5-small (384-dim)
# ---------------------------------------------------------------------------


class HuggingFaceEmbedder:
    """
    Local SentenceTransformer embedding model based on intfloat/multilingual-e5-small.

    Features:
      - 384 output dimension (validated on load)
      - E5-compliant prefixing ("passage: " for documents, "query: " for queries)
      - Batch inference support
      - L2 normalization enabled for cosine similarity
      - Thread-safe model inference
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        dimension: int = EMBEDDING_DIM,
        normalize_embeddings: bool = True,
        batch_size: int = 32,
    ) -> None:
        self._model_path = model_path or rag_settings.EMBEDDING_MODEL_PATH
        self._target_dimension = dimension
        self._normalize_embeddings = normalize_embeddings
        self._batch_size = batch_size
        self._lock = threading.Lock()
        self._model = None

        # Validate that the model can be loaded and verify dimensionality
        self._ensure_loaded()

    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return

        with self._lock:
            if self._model is not None:
                return

            from sentence_transformers import SentenceTransformer

            path = Path(self._model_path)
            model_identifier = str(path) if path.exists() else rag_settings.EMBEDDING_MODEL

            logger.info("Loading embedding model from %s", model_identifier)
            self._model = SentenceTransformer(model_identifier)

            # Validate embedding dimension using modern get_embedding_dimension()
            actual_dim = self._model.get_embedding_dimension()
            if actual_dim != self._target_dimension:
                raise ValueError(
                    f"Model embedding dimension mismatch: expected {self._target_dimension}, "
                    f"got {actual_dim} from {model_identifier}"
                )
            self._dimension = actual_dim
            logger.info("Embedding model loaded successfully (dimension=%d)", self._dimension)

    @property
    def dimension(self) -> int:
        return self._dimension

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of document passages using E5 'passage: ' prefix.

        Args:
            texts: List of strings to embed.

        Returns:
            List of 384-dimensional float vectors.
        """
        if not texts:
            return []

        prefixed_texts = [format_passage(t) for t in texts]
        return self._encode_batch(prefixed_texts)

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of search queries using E5 'query: ' prefix.

        Args:
            texts: List of query strings to embed.

        Returns:
            List of 384-dimensional float vectors.
        """
        if not texts:
            return []

        prefixed_texts = [format_query(t) for t in texts]
        return self._encode_batch(prefixed_texts)

    def embed_query(self, text: str) -> list[float]:
        """
        Embed a single search query using E5 'query: ' prefix.

        Args:
            text: Query string to embed.

        Returns:
            384-dimensional float vector.
        """
        results = self.embed_queries([text])
        return results[0] if results else [0.0] * self._dimension

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Default embed method (implements Embedder protocol).
        Treats inputs as document passages with 'passage: ' prefix.
        """
        return self.embed_passages(texts)

    def _encode_batch(self, texts: list[str]) -> list[list[float]]:
        self._ensure_loaded()
        with self._lock:
            embeddings = self._model.encode(
                texts,
                batch_size=self._batch_size,
                normalize_embeddings=self._normalize_embeddings,
                show_progress_bar=False,
            )

        # Convert numpy array / tensors to Python list of floats
        if hasattr(embeddings, "tolist"):
            return embeddings.tolist()
        return [list(map(float, vec)) for vec in embeddings]


# ---------------------------------------------------------------------------
# NullEmbedder — stub for pipeline testing without ML models
# ---------------------------------------------------------------------------


class NullEmbedder:
    """
    Stub embedder that returns zero vectors of dimension 384.

    Purpose:
      Allows chunker/indexer/retriever tests to run in environments without
      ML packages or model weights installed.
    """

    def __init__(self, dimension: int = EMBEDDING_DIM) -> None:
        self._dimension = dimension

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        return [[0.0] * self._dimension for _ in texts]

    def embed_passages(self, texts: list[str]) -> list[list[float]]:
        return self.embed(texts)

    def embed_queries(self, texts: list[str]) -> list[list[float]]:
        return self.embed(texts)

    def embed_query(self, text: str) -> list[float]:
        return [0.0] * self._dimension

    @property
    def dimension(self) -> int:
        return self._dimension


# ---------------------------------------------------------------------------
# Global Singleton Cache & Factory
# ---------------------------------------------------------------------------

_cached_embedder: Optional[Embedder] = None
_embedder_lock = threading.Lock()


def get_embedder(provider: Optional[str] = None) -> Embedder:
    """
    Return the configured embedder instance (cached singleton).

    Args:
        provider: "huggingface" or "null". Defaults to rag_settings.EMBEDDING_PROVIDER.
    """
    global _cached_embedder

    active_provider = (provider or rag_settings.EMBEDDING_PROVIDER).lower()

    if _cached_embedder is not None:
        # Return cached instance if matching provider type
        if active_provider in ("huggingface", "hf") and isinstance(_cached_embedder, HuggingFaceEmbedder):
            return _cached_embedder
        if active_provider == "null" and isinstance(_cached_embedder, NullEmbedder):
            return _cached_embedder

    with _embedder_lock:
        if active_provider in ("huggingface", "hf", "sentence-transformers"):
            _cached_embedder = HuggingFaceEmbedder()
        elif active_provider == "null":
            _cached_embedder = NullEmbedder(dimension=rag_settings.EMBEDDING_DIMENSION)
        else:
            raise ValueError(f"Unknown EMBEDDING_PROVIDER: {active_provider!r}")

        return _cached_embedder
