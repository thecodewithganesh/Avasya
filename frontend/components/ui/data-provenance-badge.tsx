import type { DataProvenance } from "@/types/api";

const styles: Record<DataProvenance, string> = {
  REAL: "text-safe border-safe/40 bg-safe/10",
  MIXED: "text-accent border-accent/40 bg-accent/10",
  /** Amber-red: visually distinct so judges/officers immediately notice synthetic data */
  SYNTHETIC_DEMO: "text-[#F2B33D] border-[#8A5A2B]/60 bg-[#8A5A2B]/15",
  /** Immediate red: missing evidence is a data quality failure, not neutral */
  UNAVAILABLE: "text-immediate border-immediate/40 bg-immediate/10",
  /** Muted red: unknown provenance must also stand out as a warning */
  UNKNOWN: "text-immediate/80 border-immediate/25 bg-immediate/5",
};

const labels: Record<DataProvenance, string> = {
  REAL: "REAL",
  MIXED: "MIXED",
  SYNTHETIC_DEMO: "SYNTHETIC DEMO",
  UNAVAILABLE: "UNAVAILABLE",
  UNKNOWN: "UNKNOWN",
};

export default function DataProvenanceBadge({ provenance }: { provenance: DataProvenance }) {
  return (
    <span
      title={`Data provenance: ${labels[provenance]}`}
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-display text-[8px] font-semibold tracking-[0.14em] ${styles[provenance]}`}
    >
      {labels[provenance]}
    </span>
  );
}