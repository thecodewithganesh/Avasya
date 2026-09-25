"use client";

import { useEffect, useState } from "react";
import type { EvidenceRecord } from "@/types/rag";
import { getHabitationEvidence } from "@/lib/evidence-api";

/** SOURCES citation block for the recommendation briefing. Lists the evidence
 *  records associated with the recommendation's habitation; absent records
 *  render nothing rather than invented citations. */
export default function EvidenceCitationBlock({ habitationId }: { habitationId: string }) {
  const [records, setRecords] = useState<EvidenceRecord[]>();
  useEffect(() => {
    let active = true;
    getHabitationEvidence(habitationId)
      .then((bundle) => active && setRecords(bundle.evidence))
      .catch(() => active && setRecords([]));
    return () => {
      active = false;
    };
  }, [habitationId]);

  if (!records || records.length === 0) return null;

  return (
    <section className="panel p-5" aria-label="Sources">
      <div className="eyebrow text-accent">SOURCES</div>
      <p className="mt-1.5 text-[11px] leading-5 text-[var(--color-fg-3)]">Evidence records associated with habitation H{habitationId.padStart(3, "0")}.</p>
      <ol className="mt-3 space-y-2">
        {records.map((record, index) => (
          <li key={record.sourceId ?? index} className="flex items-baseline gap-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
            <span className="mono shrink-0 text-accent">[{index + 1}]</span>
            <span>
              {record.title ?? "Title not supplied"}
              {record.sourceId && <span className="mono ml-1.5 text-[9.5px] text-[var(--color-fg-3)]">{record.sourceId}</span>}
              {record.origin !== "REAL" && <span className="ml-1.5 text-[9px] font-semibold tracking-[0.1em] text-medium">SYNTHETIC</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
