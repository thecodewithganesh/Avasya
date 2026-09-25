import { ApiError } from "@/types/api";
import type { Habitation, Recommendation, RiskAssessment } from "@/types/api";
import type { AiExplanation, EvidenceBundle, EvidenceQueryResult, EvidenceRecord } from "@/types/rag";
import { API_V1, SERVER_API_V1, resolveUseMockData } from "@/lib/api-base";
import { mockEvidenceRecords } from "@/lib/mock-evidence";

/**
 * Evidence / RAG loaders.
 *
 * The documented pipeline is: rule engine → RAG (multilingual-e5-small →
 * PostgreSQL + pgvector + HNSW) → Qwen3-8B-Q4_K_M explanation / officer Q&A.
 *
 * The backend now implements the retrieval endpoints (RAG module wired at
 * backend/rag/):
 *   GET  /habitations/{id}/evidence  → EvidenceBundle
 *   POST /evidence/search            → EvidenceQueryResult (semantic w/
 *                                      keyword fallback; retrievalMethod
 *                                      says which ran)
 *   POST /habitations/{id}/explain   → AiExplanation (503 when LLM
 *                                      unconfigured — honest state)
 *
 * MOCK mode still serves the clearly labeled SYNTHETIC_DEMO corpus so the
 * offline demo never depends on the API being up.
 */

function apiPrefix(): string {
  // Same server-side fallback rule as lib/api.ts (Docker SSR resolves the
  // backend via the compose service name).
  return typeof window === "undefined" ? SERVER_API_V1 : API_V1;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiPrefix()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the AVASYA API service.");
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { detail?: unknown } | null;
    const message =
      typeof detail?.detail === "string"
        ? detail.detail
        : detail?.detail && typeof detail.detail === "object" && "message" in (detail.detail as Record<string, unknown>)
          ? String((detail.detail as Record<string, unknown>).message)
          : `Request failed (${response.status})`;
    throw new ApiError("unavailable", response.status, message);
  }
  return (await response.json()) as T;
}

/** Client-side lexical ranking over the synthetic corpus. Pure presentation
 *  ordering for the demo explorer — NOT a semantic search implementation and
 *  never labeled as one. */
function rankMock(query: string, records: EvidenceRecord[], limit = 8): EvidenceQueryResult {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = records
    .map((record) => {
      const haystack = `${record.title ?? ""} ${record.snippet ?? ""} ${record.hazardType ?? ""}`.toLowerCase();
      const hits = terms.filter((term) => haystack.includes(term)).length;
      return { record, hits };
    })
    .filter((entry) => entry.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, limit);
  return { query, results: scored.map((entry) => entry.record), dataOrigin: "SYNTHETIC_DEMO" };
}

export async function getHabitationEvidence(habitationId: string): Promise<EvidenceBundle> {
  if (USE_MOCK()) {
    return {
      habitationId,
      evidence: mockEvidenceRecords.filter((record) => record.habitationId === habitationId),
      dataOrigin: "SYNTHETIC_DEMO",
    };
  }
  // LIVE: documented endpoint (backend/routes/evidence.py, wire id "H{n}").
  const wireId = habitationId.match(/^(?:H|D)?0*(\d+)$/i)?.[1] ?? habitationId;
  return getJsonEvidence(`/habitations/${encodeURIComponent(wireId)}/evidence`);
}

async function getJsonEvidence(path: string): Promise<EvidenceBundle> {
  let response: Response;
  try {
    response = await fetch(`${apiPrefix()}${path}`, { cache: "no-store" });
  } catch {
    throw new ApiError("network", 0, "Unable to reach the AVASYA API service.");
  }
  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? "not-found" : "unavailable",
      response.status,
      response.status === 404 ? "Habitation not found." : "Evidence retrieval failed.",
    );
  }
  return (await response.json()) as EvidenceBundle;
}

export async function searchEvidence(query: string): Promise<EvidenceQueryResult> {
  if (USE_MOCK()) {
    const trimmed = query.trim();
    if (!trimmed) return { query: trimmed, results: [], dataOrigin: "SYNTHETIC_DEMO" };
    return rankMock(trimmed, mockEvidenceRecords);
  }
  // LIVE: semantic retrieval over the pgvector corpus (keyword fallback
  // server-side). The response shape matches EvidenceQueryResult; the
  // backend's `retrievalMethod` field documents which engine answered.
  const body = await postJson<EvidenceQueryResult & { retrievalMethod?: string }>(
    "/evidence/search",
    { query },
  );
  return { query: body.query, results: body.results, dataOrigin: body.dataOrigin, retrievalMethod: body.retrievalMethod };
}

export async function explainWithAvasya(input: {
  habitationId: string;
  assessment: RiskAssessment;
  habitation: Habitation;
  recommendation?: Recommendation;
}): Promise<AiExplanation> {
  if (USE_MOCK()) {
    // Synthetic demo: assemble the explanation from persisted contract values the
    // officer can verify on-screen (score, level, top factors, capacity gate).
    // Clearly labeled SYNTHETIC DEMO in the UI — never presented as the live LLM.
    const top = [...input.assessment.factors].sort((a, b) => b.contribution - a.contribution).slice(0, 3);
    const names = top.map((factor) => factor.name.toLowerCase()).join(", ");
    const capacity =
      input.recommendation?.capacityStatus === "SUFFICIENT"
        ? `The recommended destination passes the capacity gate`
        : input.recommendation
          ? `The recommended destination does not pass the capacity gate`
          : `No relocation recommendation has been issued yet`;
    const explanation =
      `${input.habitation.name} is classified ${input.assessment.level} risk with a persisted score of ${input.assessment.score}/100. ` +
      `The largest rule-engine contributions are ${names}. ` +
      `${capacity}${input.recommendation?.destinationId ? ` for destination ${input.recommendation.destinationId}` : ""}. ` +
      `The final relocation decision remains with the authorized officer.`;
    return {
      habitationId: input.habitationId,
      explanation,
      evidenceUsed: mockEvidenceRecords.filter((record) => record.habitationId === input.habitationId).slice(0, 3),
      model: "SYNTHETIC DEMO — Qwen3-8B-Q4_K_M not connected",
      generatedAt: null,
      dataOrigin: "SYNTHETIC_DEMO",
    };
  }
  // LIVE: the grounded explanation endpoint bridges ai/llm. It surfaces an
  // honest 503 (llm_unavailable) when the model is not configured — the
  // caller renders that state, we do not invent text.
  const wireId = input.habitationId.match(/^(?:H|D)?0*(\d+)$/i)?.[1] ?? input.habitationId;
  return postJson<AiExplanation>(`/habitations/${encodeURIComponent(wireId)}/explain`, {
    question: `Why is ${input.habitation.name} flagged for relocation review?`,
  });
}

function USE_MOCK(): boolean {
  // Same resolution as lib/api (shared helper) so both stacks always agree
  // on the data mode — LIVE is the default; demo is an explicit opt-in.
  return resolveUseMockData();
}

/** Evidence-stack data mode, for honest UI labelling (mirrors lib/api). */
export const EVIDENCE_DATA_MODE: "LIVE" | "MOCK" = USE_MOCK() ? "MOCK" : "LIVE";
