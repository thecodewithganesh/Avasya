import { AlertTriangle, Check, Minus } from "lucide-react";
import type { EvidenceAvailability, EvidenceGranularity } from "@/types/api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import type { DataProvenance } from "@/types/api";

const granularityLabels: Record<EvidenceGranularity, string> = {
  HABITATION: "HABITATION",
  VILLAGE: "VILLAGE",
  TALUK: "TALUK",
  DISTRICT: "DISTRICT",
  STATE: "STATE",
  REGIONAL: "REGIONAL",
  UNKNOWN: "UNKNOWN LEVEL",
};

export default function EvidenceStatus({
  label,
  availability,
  granularity,
  provenance,
  value,
  source,
  note,
}: {
  label: string;
  availability: EvidenceAvailability;
  granularity: EvidenceGranularity;
  provenance: DataProvenance;
  value?: string | number | null;
  source?: string | null;
  note?: string | null;
}) {
  const available = availability === "AVAILABLE";
  const partial = availability === "PARTIAL";
  const Icon = available ? Check : partial ? Minus : AlertTriangle;
  const tone = available ? "text-safe" : partial ? "text-medium" : "text-[var(--color-fg-3)]";
  const status = available ? "AVAILABLE" : partial ? "PARTIAL" : "UNAVAILABLE";
  return (
    <div className="border-b border-[var(--color-line)] py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon size={13} className={tone} aria-hidden="true" />
            <span className="text-[12px] font-semibold text-[var(--color-fg)]">{label}</span>
          </div>
          <div className={`mt-1 pl-5 text-[10px] font-semibold tracking-[0.12em] ${tone}`}>{status}</div>
        </div>
        <DataProvenanceBadge provenance={provenance} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 pl-5 text-[10px] text-[var(--color-fg-3)]">
        {value !== null && value !== undefined && <span className="metric text-[var(--color-fg-2)]">{value}</span>}
        <span>{granularityLabels[granularity]}</span>
        {source && <span>SOURCE: {source}</span>}
      </div>
      {note && <p className="mt-1.5 pl-5 text-[11px] leading-5 text-[var(--color-fg-3)]">{note}</p>}
    </div>
  );
}