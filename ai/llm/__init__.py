"""AVASYA LLM module (teammate-owned design, integration-lead implementation).

The LLM understands the incoming hazard, identifies what evidence needs to be
checked (Stage 1), receives evidence retrieved by RAG, reasons over current +
historical evidence (Stage 2), and generates a structured, evidence-grounded
response for the AVASYA decision-support workflow.

The LLM is NEVER authoritative for operational values (population, risk,
capacity, coordinates, travel time, hazard status, eligibility, approval).
Those come from AVASYA structured services and are validated separately.
"""
from ai.llm.config import LlmConfig, llm_config
from ai.llm.llm_service import LlmNotConfigured, LlmRuntimeError, LlmService

__all__ = [
    "LlmConfig",
    "LlmNotConfigured",
    "LlmRuntimeError",
    "LlmService",
    "llm_config",
]
