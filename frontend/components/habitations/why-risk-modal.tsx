"use client";

import Modal from "@/components/ui/modal";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import type { DataProvenance } from "@/types/api";
import type { Habitation, RiskAssessment } from "@/types/api";

const severityChip: Record<string, { label: string; className: string }> = {
  critical: { label: "HIGH", className: "text-immediate border-immediate/40" },
  elevated: { label: "MEDIUM", className: "text-short border-short/40" },
  moderate: { label: "LOW", className: "text-[var(--color-fg-3)] border-[var(--color-line)]" },
};

function DataRow({ label, available, detail, provenance }: { label: string; available: boolean; detail?: string; provenance: DataProvenance }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[12px] font-medium text-[var(--color-fg-2)]">{label}</div>
        {detail && <div className="mt-0.5 truncate text-[10.5px] text-[var(--color-fg-3)]">{detail}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`text-[9.5px] font-semibold tracking-[0.14em] ${available ? "text-safe" : "text-[var(--color-fg-3)]"}`}>
          {available ? "AVAILABLE" : "NOT AVAILABLE"}
        </span>
        {available && <DataProvenanceBadge provenance={provenance} />}
      </div>
    </div>
  );
}

/**
 * WHY THIS RISK? — investigation drawer for one habitation's persisted assessment.
 * Renders ONLY values present on the RiskAssessment/Habitation contract; missing
 * evidence is shown as NOT AVAILABLE, never inferred.
 */
export default function WhyRiskModal({
  assessment,
  habitation,
  onClose,
}: {
  assessment: RiskAssessment;
  habitation?: Habitation;
  onClose: () => void;
}) {
  const factors = [...assessment.factors].sort((a, b) => b.contribution - a.contribution);
  const has = (needle: string) => factors.some((factor) => factor.name.toLowerCase().includes(needle));

  return (
    <Modal eyebrow="RISK INVESTIGATION" title={`Why is this habitation ${assessment.level} risk?`} onClose={onClose}>
      {/* Classification */}
      <div className="mt-5 flex items-end justify-between gap-4 border-y border-[var(--color-line)] py-4">
        <div>
          <div className="eyebrow">RISK CLASSIFICATION</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="metric text-[44px] font-semibold leading-none tracking-[-0.04em] text-[var(--color-fg)]">{assessment.score}</span>
            <span className="metric pb-1 text-xs text-[var(--color-fg-3)]">/ 100</span>
            <span className="pb-1.5 font-display text-xs font-semibold tracking-[0.16em] text-immediate">{assessment.level}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="eyebrow">RELOCATION PRIORITY</div>
          <div className="mt-1.5 font-display text-sm font-semibold tracking-[0.1em] text-short">{habitation?.priority ?? "UNAVAILABLE"}</div>
          <div className="mt-2 text-[10px] text-[var(--color-fg-3)]">
            {assessment.generatedAt ? `Computed ${new Date(assessment.generatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}` : "COMPUTED — TIMESTAMP NOT SUPPLIED"}
          </div>
        </div>
      </div>

      {/* Contributing factors — ranked, from persisted contributions only */}
      <div className="mt-5">
        <div className="flex items-center justify-between">
          <div className="eyebrow">CONTRIBUTING FACTORS</div>
          <DataProvenanceBadge provenance={assessment.dataOrigin} />
        </div>
        {factors.length > 0 ? (
          <ol className="mt-3 space-y-0">
            {factors.map((factor, index) => {
              const chip = severityChip[factor.severity] ?? severityChip.moderate;
              return (
                <li key={factor.name} className="flex items-center gap-3 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
                  <span className="metric w-5 shrink-0 text-[10px] text-[var(--color-fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-fg-2)]">{factor.name}</div>
                    <div className="mt-0.5 text-[10.5px] leading-4 text-[var(--color-fg-3)]">{factor.explanation}</div>
                  </div>
                  <span className={`shrink-0 rounded-[3px] border px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] ${chip.className}`}>{chip.label}</span>
                  <span className="metric w-12 shrink-0 text-right text-sm font-semibold text-[var(--color-fg)]">+{factor.contribution.toFixed(1)}</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 rounded-[4px] border border-[var(--color-line)] bg-[var(--panel-wash)] p-3 text-[12px] leading-5 text-[var(--color-fg-2)]">
            Contribution data was not supplied for this assessment. The persisted score of {assessment.score} ({assessment.level}) stands as recorded — factors cannot be broken down without backend values, and none are estimated here.
          </p>
        )}
      </div>

      {/* Data used — every input named, missing ones admitted */}
      <div className="mt-5">
        <div className="eyebrow">DATA USED BY THE RULE ENGINE</div>
        <div className="mt-2">
          <DataRow label="Habitation record" available detail={`ID ${habitation?.id ?? assessment.habitationId}${habitation?.district ? ` · ${habitation.district}` : ""}${habitation?.population != null ? ` · ${habitation.population.toLocaleString("en-IN")} people` : ""}`} provenance={habitation?.dataOrigin ?? assessment.dataOrigin} />
          <DataRow label="Hazard exposure" available={Boolean(habitation?.hazard)} detail={habitation?.hazard ?? "No hazard classification supplied for this record"} provenance={habitation?.dataOrigin ?? assessment.dataOrigin} />
          <DataRow label="Historical event evidence" available={has("historical")} detail={has("historical") ? "Contribution supplied by the assessment" : "No historical contribution in the persisted assessment"} provenance={assessment.dataOrigin} />
          <DataRow label="Accessibility data" available={has("road")} detail={has("road") ? "Contribution supplied by the assessment" : "No road-accessibility contribution in the persisted assessment"} provenance={assessment.dataOrigin} />
          <DataRow label="Population & vulnerability" available={has("population") || has("vulnerability")} detail={has("population") || has("vulnerability") ? "Contribution supplied by the assessment" : "No population/vulnerability contribution in the persisted assessment"} provenance={assessment.dataOrigin} />
        </div>
      </div>

      {/* Limitations — warnings are contract data, never invented */}
      <div className="mt-5">
        <div className="eyebrow">EVIDENCE LIMITATIONS</div>
        {assessment.warnings.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {assessment.warnings.map((warning) => (
              <li key={warning} className="flex gap-2 text-[11.5px] leading-5 text-[var(--color-fg-2)]">
                <span aria-hidden="true" className="mt-[6px] h-[5px] w-[5px] shrink-0 rounded-full bg-short" />
                {warning}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11.5px] text-[var(--color-fg-2)]">No coverage warnings were recorded with this assessment.</p>
        )}
        {assessment.dataQuality && (
          <p className="mt-2 text-[10.5px] text-[var(--color-fg-3)]">Assessment data quality: {assessment.dataQuality.toUpperCase()}{assessment.confidence !== null ? ` · Confidence ${Math.round(assessment.confidence * 100)}%` : ""}.</p>
        )}
      </div>

      <p className="mt-5 border-t border-[var(--color-line)] pt-3 text-[10px] leading-4 text-[var(--color-fg-3)]">
        Risk is assigned by the backend rule engine (GIS + weighted scoring). This panel restates its persisted output — it does not recalculate, estimate, or interpret missing evidence.
      </p>
    </Modal>
  );
}
