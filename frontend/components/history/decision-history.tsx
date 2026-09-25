"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Gavel, ShieldCheck } from "lucide-react";
import { getApprovalHistory } from "@/lib/api";
import { clearSessionDecisions, readSessionDecisions } from "@/lib/decision-log";
import type { SessionDecision } from "@/lib/decision-log";
import type { WireApprovalHistoryEntry } from "@/types/api";

/**
 * OFFICER DECISION HISTORY — every confirmed approval/override.
 *
 * Two sources, clearly separated:
 *  1. PERSISTED — GET /api/v1/recommendations/approvals (database; survives
 *     reloads and past sessions).
 *  2. SESSION — the local session log (immediate feedback for decisions
 *     confirmed in this browser session).
 *
 * Neither source is ever fabricated; if both are empty the panel says so.
 */

interface MergedDecision {
  key: string;
  action: "APPROVED" | "OVERRIDDEN" | "REJECTED";
  timestamp: string;
  habitationId: string | null;
  habitationName: string;
  recommendationId: string;
  originalDestination: number | string | null;
  finalDestination: number | string | null;
  reason: string | null;
  note: string | null;
  dataOrigin: string;
  persisted: boolean;
}

const fromWire = (entry: WireApprovalHistoryEntry): MergedDecision => ({
  key: `db-${entry.approval_id}`,
  action: entry.action,
  timestamp: entry.decision_time,
  habitationId: entry.habitation_id !== null ? String(entry.habitation_id) : null,
  habitationName: entry.habitation_name ?? "—",
  recommendationId: String(entry.recommendation_id),
  originalDestination: entry.original_destination_id,
  finalDestination: entry.final_destination_name ?? entry.final_destination_id,
  reason: entry.action === "OVERRIDDEN" ? entry.override_note : null,
  note: entry.override_note && entry.action !== "OVERRIDDEN" ? entry.override_note : null,
  dataOrigin: entry.data_origin,
  persisted: true,
});

const fromSession = (decision: SessionDecision): MergedDecision => ({
  key: decision.id,
  action: decision.action === "approve" ? "APPROVED" : "OVERRIDDEN",
  timestamp: decision.timestamp,
  habitationId: decision.habitationId,
  habitationName: decision.habitationName,
  recommendationId: decision.recommendationId,
  originalDestination: decision.originalDestination,
  finalDestination: decision.finalDestination,
  reason: decision.reason,
  note: decision.note,
  dataOrigin: decision.dataOrigin,
  persisted: false,
});

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export default function DecisionHistory() {
  const [persisted, setPersisted] = useState<WireApprovalHistoryEntry[] | null>(null);
  const [persistedError, setPersistedError] = useState(false);
  const [sessionDecisions, setSessionDecisions] = useState<SessionDecision[]>([]);

  useEffect(() => {
    let active = true;
    getApprovalHistory(50)
      .then((rows) => {
        if (active) setPersisted(rows);
      })
      .catch(() => {
        if (active) {
          setPersisted([]);
          setPersistedError(true);
        }
      });
    const sync = () => setSessionDecisions(readSessionDecisions());
    sync();
    window.addEventListener("avasya:decisions", sync);
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      window.removeEventListener("avasya:decisions", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Session decisions are shown on top (freshest), then persisted records.
  // A session decision is hidden once its persisted twin appears (same
  // recommendation + action within the loaded page) to avoid duplicates.
  const persistedKeys = new Set(
    (persisted ?? []).map((entry) => `${entry.recommendation_id}:${entry.action}`),
  );
  const sessionOnly = sessionDecisions.filter(
    (decision) => !persistedKeys.has(`${decision.recommendationId}:${decision.action === "approve" ? "APPROVED" : "OVERRIDDEN"}`),
  );
  const merged: MergedDecision[] = [...sessionOnly.map(fromSession), ...(persisted ?? []).map(fromWire)];

  return (
    <section className="panel overflow-hidden" aria-label="Officer decision history">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-line)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Gavel size={14} className="text-accent" aria-hidden="true" />
          <span className="font-display text-[13px] font-semibold text-[var(--color-fg)]">Officer decision history</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-[3px] border border-safe/40 bg-safe/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-safe">
            {persisted === null ? "LOADING…" : persistedError ? "API UNREACHABLE" : `${persisted.length} PERSISTED`}
          </span>
          {sessionDecisions.length > 0 && (
            <button type="button" onClick={clearSessionDecisions} className="btn btn-ghost btn-sm">
              Clear session
            </button>
          )}
        </div>
      </div>

      {merged.length === 0 ? (
        <p className="p-5 text-[12px] leading-5 text-[var(--color-fg-2)]">
          No officer decisions recorded yet. Approve or override a recommendation in the{" "}
          <Link href="/recommendations" className="font-semibold text-accent hover:text-[var(--color-fg)]">decision queue</Link>{" "}
          — every confirmed decision is stored in the database and appears here, including from past sessions.
          {persistedError && " (The history service is currently unreachable; nothing is fabricated to fill this panel.)"}
        </p>
      ) : (
        <div>
          {merged.map((decision) => (
            <article key={decision.key} className="border-b border-[var(--color-line)] p-4 last:border-b-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={`rounded-[3px] border px-2 py-0.5 text-[9px] font-semibold tracking-[0.12em] ${decision.action === "APPROVED" ? "border-safe/40 text-safe" : "border-short/40 text-short"}`}>
                  {decision.action}
                </span>
                {decision.habitationId ? (
                  <Link href={`/habitations/${decision.habitationId}`} className="font-display text-[14px] font-semibold text-[var(--color-fg)] hover:text-accent">
                    {decision.habitationName}
                  </Link>
                ) : (
                  <span className="font-display text-[14px] font-semibold text-[var(--color-fg)]">{decision.habitationName}</span>
                )}
                <span className="mono text-[10px] text-[var(--color-fg-3)]">REC {decision.recommendationId}</span>
                <span className="rounded-[3px] border border-[var(--color-line)] px-1.5 py-0.5 text-[8.5px] font-semibold tracking-[0.1em] text-[var(--color-fg-3)]">
                  {decision.persisted ? "PERSISTED" : "THIS SESSION"}
                </span>
                <span className="ml-auto mono text-[10px] text-[var(--color-fg-3)]">{fmt(decision.timestamp)}</span>
              </div>
              <dl className="mono mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-4">
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Original</dt>
                  <dd className="mt-0.5 text-[var(--color-fg-2)]">{decision.originalDestination ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Final</dt>
                  <dd className="mt-0.5 text-[var(--color-fg-2)]">{decision.finalDestination ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Officer</dt>
                  <dd className="mt-0.5 text-[var(--color-fg-2)]">#{decision.persisted ? "DB record" : "Session officer"}</dd>
                </div>
                <div>
                  <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Data mode</dt>
                  <dd className="mt-0.5 text-[var(--color-fg-2)]">{decision.dataOrigin.replace("_", " ")}</dd>
                </div>
              </dl>
              {decision.reason && <p className="mt-2 border-l-2 border-accent/50 pl-2.5 text-[11.5px] italic leading-5 text-[var(--color-fg-2)]">Reason: {decision.reason}</p>}
              {decision.note && <p className="mt-1 pl-3.5 text-[11px] leading-5 text-[var(--color-fg-3)]">Note: {decision.note}</p>}
            </article>
          ))}
        </div>
      )}

      <div className="flex items-start gap-2.5 border-t border-[var(--color-line)] bg-accent/[0.03] px-4 py-3">
        <ShieldCheck size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <p className="text-[10.5px] leading-4 text-[var(--color-fg-3)]">
          PERSISTED entries come from the approval audit trail in the database; THIS SESSION entries from decisions confirmed in this
          browser. Nothing is fabricated. AVASYA RECOMMENDS. THE HUMAN DECIDES.
        </p>
      </div>
    </section>
  );
}
