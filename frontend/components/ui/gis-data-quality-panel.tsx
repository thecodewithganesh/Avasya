import { AlertTriangle, Check, Minus } from "lucide-react";
import type { Habitation } from "@/types/api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

export default function GISDataQualityPanel({ habitations }: { habitations: Habitation[] }) {
  const mapped = habitations.filter((item) => item.coordinates !== null).length;
  const factorEvidence = habitations.filter((item) => (item.factors?.length ?? 0) > 0).length;
  const warnings = habitations.filter((item) => item.warnings.length > 0).length;
  const rows = [
    ["Habitation coordinates", mapped === habitations.length && habitations.length > 0 ? "AVAILABLE" : mapped > 0 ? "PARTIAL" : "UNAVAILABLE"],
    ["Risk factor evidence", factorEvidence === habitations.length && habitations.length > 0 ? "AVAILABLE" : factorEvidence > 0 ? "PARTIAL" : "UNAVAILABLE"],
    // Warnings mean district-level (not habitation-specific) linkage, not absence of data.
    ["Historical event linkage", warnings > 0 ? "PARTIAL" : "UNKNOWN"],
    // The backend serves zone layers via /gis/hazard-zones; treat mapped
    // habitations as evidence the geometry pipeline is live.
    ["Hazard zone geometry", mapped > 0 ? "PARTIAL" : "UNKNOWN"],
  ] as const;
  return (
    <section className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow">GIS DATA QUALITY</div>
          <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Evidence coverage</h2>
        </div>
        <DataProvenanceBadge provenance={habitations.length > 0 && habitations.every((item) => item.dataOrigin === "SYNTHETIC_DEMO") ? "SYNTHETIC_DEMO" : "UNKNOWN"} />
      </div>
      <div className="mt-3 divide-y divide-[var(--color-line)]">
        {rows.map(([label, status]) => {
          const Icon = status === "AVAILABLE" ? Check : status === "PARTIAL" ? Minus : AlertTriangle;
          const tone = status === "AVAILABLE" ? "text-safe" : status === "PARTIAL" ? "text-medium" : status === "UNKNOWN" ? "text-immediate/70" : "text-immediate";
          return <div key={label} className="flex items-center justify-between gap-3 py-2 text-[11px]"><span className="text-[var(--color-fg-2)]">{label}</span><span className={`flex items-center gap-1.5 font-semibold tracking-[0.1em] ${tone}`}><Icon size={12} aria-hidden="true" />{status}</span></div>;
        })}
      </div>
    </section>
  );
}