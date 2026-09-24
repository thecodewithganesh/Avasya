/**
 * RAG / evidence view models.
 *
 * Backend truth (M's pipeline): rule engine → RAG retrieval
 * (intfloat/multilingual-e5-small → PostgreSQL + pgvector + HNSW) →
 * Qwen3-8B-Q4_K_M explanation / officer Q&A.
 *
 * E5 is the RETRIEVAL EMBEDDING MODEL, not a risk predictor. The UI must never
 * represent it as one. Until M exposes RAG endpoints, every loader here throws
 * ApiError("unavailable", 503) — the UI renders honest states, never invented
 * sources or AI text.
 */

import type { DataOrigin } from "@/types/api";

export type EvidenceSourceType = "REPORT" | "HISTORICAL_EVENT" | "FIELD_SURVEY" | "ASSESSMENT" | "UNSPECIFIED";

export interface EvidenceRecord {
  /** Backend evidence ID (e.g. "FLD-2025-018"). Never generated client-side. */
  sourceId: string | null;
  title: string | null;
  sourceType: EvidenceSourceType;
  /** Owning habitation, when the chunk is habitation-associated. */
  habitationId: string | null;
  hazardType: string | null;
  /** ISO date or year label as supplied. */
  date: string | null;
  /** Retrieved snippet/chunk text. */
  snippet: string | null;
  origin: DataOrigin | "UNAVAILABLE";
  /** Verification status as supplied (e.g. "VERIFIED", "UNVERIFIED"). */
  verification: string | null;
  /** Retrieval similarity when the backend supplies it (0–1). */
  relevance: number | null;
}

export interface EvidenceQueryResult {
  query: string;
  results: EvidenceRecord[];
  /** Retrieval corpus provenance, as supplied by the backend. */
  dataOrigin: DataOrigin | "UNAVAILABLE";
}

export interface EvidenceBundle {
  habitationId: string;
  evidence: EvidenceRecord[];
  dataOrigin: DataOrigin | "UNAVAILABLE";
}

/** Qwen3 explanation over retrieved evidence. `evidenceUsed` cites what RAG fed the model. */
export interface AiExplanation {
  habitationId: string;
  explanation: string;
  evidenceUsed: EvidenceRecord[];
  model: string | null;
  generatedAt: string | null;
  dataOrigin: DataOrigin | "UNAVAILABLE";
}

export interface CopilotMessage {
  id: string;
  role: "officer" | "avasya";
  /** Officer-typed question or AVASYA's grounded answer. */
  text: string;
  /** Citations attached to an AVASYA answer (indices into the session's evidence). */
  citations: EvidenceRecord[];
  /** Set only when the backend could not produce an answer. */
  error?: "llm-unavailable" | "retrieval-failed" | "connection-unavailable";
  pending?: boolean;
}
