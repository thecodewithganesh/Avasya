"use client";

import { useEffect, useState } from "react";
import type { EvidenceRecord } from "@/types/rag";
import { getHabitationEvidence, EVIDENCE_DATA_MODE } from "@/lib/evidence-api";
import EvidenceCard from "@/components/ui/evidence-card";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import { RowSkeleton } from "@/components/ui/data-states";
import type { DataProvenance } from "@/types/api";

/** EVIDENCE section for one habitation — retrieval-backed, honestly stateful.
 *  The corpus badge is DERIVED from the backend's bundle dataOrigin, never
 *  hardcoded: a live store holding REAL rows must not be labelled as a demo
 *  corpus (and vice versa). */
export default function EvidenceSection({ habitationId }: { habitationId: string }) {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "unavailable">("loading");
  const [records, setRecords] = useState<EvidenceRecord[]>([]);
  const [bundleOrigin, setBundleOrigin] = useState<DataProvenance>("UNAVAILABLE");

  useEffect(() => {
    let active = true;
    // State starts at "loading" and the parent remounts us per habitation
    // (keyed), so no synchronous reset is needed in the effect body.
    getHabitationEvidence(habitationId)
      .then((bundle) => {
        if (!active) return;
        setRecords(bundle.evidence);
        setBundleOrigin(bundle.evidence.length > 0 ? bundle.dataOrigin : "UNAVAILABLE");
        setState(bundle.evidence.length > 0 ? "ready" : "empty");
      })
      .catch(() => active && setState("unavailable"));
    return () => {
      active = false;
    };
  }, [habitationId]);

  return (
    <section className="panel p-5" aria-label="Evidence">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">EVIDENCE</div>
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Retrieved records for this habitation</h2>
        </div>
        <span className="flex items-center gap-1.5">
          {EVIDENCE_DATA_MODE === "MOCK" && (
            <span className="rounded-[3px] border border-insight/40 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-insight">MOCK CLIENT</span>
          )}
          <DataProvenanceBadge provenance={bundleOrigin} />
        </span>
      </div>

      {state === "loading" && <div className="mt-4 space-y-2">{[0, 1].map((row) => <RowSkeleton key={row} rows={1} />)}</div>}

      {state === "ready" && (
        <div className="mt-4 space-y-2.5">
          {records.map((record, index) => (
            <EvidenceCard key={record.sourceId ?? index} evidence={record} rank={index + 1} />
          ))}
        </div>
      )}

      {state === "empty" && (
        <p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-2)]">No evidence found for this habitation in the current store.</p>
      )}

      {state === "unavailable" && (
        <p className="mt-3 border border-immediate/30 bg-immediate/[0.05] p-3 text-[12px] leading-5 text-immediate" role="alert">
          Evidence retrieval unavailable — no retrieval endpoint is documented in the current backend contract. No
          evidence is simulated while it is unavailable.
        </p>
      )}
    </section>
  );
}
