import type { EvidenceRecord } from "@/types/rag";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

const typeLabel: Record<string, string> = {
  REPORT: "SOURCE RECORD",
  HISTORICAL_EVENT: "HISTORICAL EVENT",
  FIELD_SURVEY: "FIELD SURVEY",
  ASSESSMENT: "ASSESSMENT RECORD",
  UNSPECIFIED: "SOURCE TYPE NOT SUPPLIED",
};

/** Compact evidence card. Renders only supplied fields; missing ones are
 *  omitted or shown as NOT AVAILABLE — never fabricated. "GOVERNMENT SOURCE"
 *  is reserved for records whose provenance is REAL; a synthetic report row
 *  must never borrow government-looking language (audit Part 25). */
export default function EvidenceCard({ evidence, rank }: { evidence: EvidenceRecord; rank?: number }) {
  const isReal = evidence.origin === "REAL";
  const label = evidence.sourceType === "REPORT" && isReal ? "GOVERNMENT SOURCE" : typeLabel[evidence.sourceType] ?? typeLabel.UNSPECIFIED;
  return (
    <article className="border border-[var(--color-line)] bg-[var(--panel-wash)] p-4 transition-colors hover:border-accent/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {rank !== undefined && <span className="metric text-[10px] text-accent">[{rank}]</span>}
            <h3 className="truncate font-display text-[14px] font-semibold text-[var(--color-fg)]">{evidence.title ?? "TITLE NOT SUPPLIED"}</h3>
          </div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-fg-3)]">
            {label}
          </div>
        </div>
        <DataProvenanceBadge provenance={evidence.origin} />
      </div>

      {evidence.snippet && (
        <blockquote className="mt-3 border-l-2 border-accent/50 pl-3 text-[12px] leading-5 text-[var(--color-fg-2)]">
          “{evidence.snippet}”
        </blockquote>
      )}

      <dl className="mono mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-[var(--color-line)] pt-2.5 text-[10px] sm:grid-cols-4">
        <div>
          <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Source ID</dt>
          <dd className="mt-0.5 text-[var(--color-fg-2)]">{evidence.sourceId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Habitation</dt>
          <dd className="mt-0.5 text-[var(--color-fg-2)]">{evidence.habitationId ? `H${evidence.habitationId.padStart(3, "0")}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Hazard / date</dt>
          <dd className="mt-0.5 text-[var(--color-fg-2)]">{[evidence.hazardType, evidence.date].filter(Boolean).join(" · ") || "—"}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Relevance</dt>
          <dd className="mt-0.5 text-[var(--color-fg-2)]">{evidence.relevance !== null ? `${Math.round(evidence.relevance * 100)}%` : "NOT SUPPLIED"}</dd>
        </div>
      </dl>

      <div className="mt-2 text-[9.5px] tracking-[0.08em] text-[var(--color-fg-3)]">{evidence.verification ?? "VERIFICATION STATUS NOT SUPPLIED"}</div>
    </article>
  );
}
