/**
 * Session decision records — a frontend presentation log of approvals that
 * actually happened in this browser session. The backend contract exposes
 * POST /recommendations/{id}/approval but no history-read endpoint, so these
 * records are kept in sessionStorage and always labeled SESSION RECORDS.
 * Nothing here is invented: an entry exists only after a confirmed API result
 * was returned by approveRecommendation().
 */

export type ApprovalAction = "approve" | "override";

import type { DataOrigin } from "@/types/api";

export interface SessionDecision {
  id: string;
  /** ISO timestamp captured at API confirmation. */
  timestamp: string;
  habitationId: string;
  habitationName: string;
  recommendationId: string;
  originalDestination: string | null;
  finalDestination: string;
  action: ApprovalAction;
  reason: string | null;
  note: string | null;
  dataOrigin: DataOrigin;
}

const KEY = "avasya.decisions.v1";

export function readSessionDecisions(): SessionDecision[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SessionDecision[]) : [];
  } catch {
    return [];
  }
}

export function readDecidedRecommendationIds(): Set<string> {
  return new Set(readSessionDecisions().map((decision) => decision.recommendationId));
}

export function readDecidedHabitationIds(): Set<string> {
  return new Set(readSessionDecisions().map((decision) => decision.habitationId));
}

export function recordSessionDecision(decision: SessionDecision): void {
  if (typeof window === "undefined") return;
  const next = [decision, ...readSessionDecisions()].slice(0, 100);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("avasya:decisions"));
  } catch {
    /* storage unavailable — decision still confirmed by the API result UI */
  }
}

export function clearSessionDecisions(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("avasya:decisions"));
  } catch {
    /* ignore */
  }
}
