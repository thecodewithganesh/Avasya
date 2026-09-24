from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class RAGSettings:
    """Configuration settings specific to the AVASYA RAG subsystem."""

    # "null" (zero-vector stub) is the safe default so the stack boots without
    # ML deps; set EMBEDDING_PROVIDER=huggingface for real E5 retrieval.
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "null")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")
    EMBEDDING_DIMENSION: int = int(os.getenv("EMBEDDING_DIMENSION", "384"))
    EMBEDDING_MODEL_PATH: str = os.getenv(
        "EMBEDDING_MODEL_PATH",
        str(Path("models") / "multilingual-e5-small"),
    )
    EMBEDDING_BATCH_SIZE: int = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
    EMBEDDING_NORMALIZE: bool = os.getenv("EMBEDDING_NORMALIZE", "true").lower() == "true"


rag_settings = RAGSettings()
