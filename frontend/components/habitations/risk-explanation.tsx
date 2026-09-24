"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Habitation, RiskAssessment, RiskFactor } from "@/types/api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import EvidenceStatus from "@/components/ui/evidence-status";

const severityColor: Record<string, string> = {
  critical: "var(--color-immediate)",
  elevated: "var(--color-short)",
  moderate: "var(--color-medium)",
};

function factorEvidence(factor: RiskFactor, assessment: RiskAssessment) {
  const name = factor.name.toLowerCase();
  const historical = name.includes("historical") && assessment.warnings.some((warning) => /district|granularity|habitation/i.test(warning));
  return {
    availability: historical ? ("PARTIAL" as const) : ("AVAILABLE" as const),
    granularity: historical ? ("DISTRICT" as const) : ("HABITATION" as const),
    provenance: assessment.dataOrigin,
    note: historical ? "Evidence exists outside habitation granularity and is not treated as habitation-specific." : factor.explanation,
  };
}

export default function RiskExplanation({ assessment, habitation, recommendationId }: { assessment: RiskAssessment; habitation?: Habitation; recommendationId?: string }) {
  const [selectedName, setSelectedName] = useState<string>();
  const factors = [...assessment.factors].sort((a, b) => b.contribution - a.contribution);
  const max = Math.max(...factors.map((factor) => factor.contribution), 1);
  const selected = factors.find((factor) => factor.name === selectedName) ?? factors[0];
  const selectedEvidence = selected ? factorEvidence(selected, assessment) : undefined;
  const topThree = factors.slice(0, 3);
  return (
    <section className="space-y-4" aria-labelledby="risk-explanation-title">
      <section className="panel glow-top overflow-hidden border-accent/25">
        <div className="grid lg:grid-cols-[1fr_1.35fr]">
          <div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r lg:p-6">
            <div className="flex items-center justify-between gap-3"><div className="eyebrow text-accent">RISK ASSESSMENT</div><DataProvenanceBadge provenance={assessment.dataOrigin} /></div>
            <h2 id="risk-explanation-title" className="mt-3 font-display text-xl font-semibold text-[var(--color-fg)]">{habitation?.name ?? `Habitation ${assessment.habitationId}`}</h2>
            <div className="mt-7 flex items-end gap-3"><span className="metric text-[78px] font-semibold leading-[0.82] tracking-[-0.06em] text-[var(--color-fg)]">{assessment.score}</span><span className="metric pb-1 text-sm text-[var(--color-fg-3)]">/ 100</span></div>
            <div className="mt-3 font-display text-xs font-semibold tracking-[0.16em] text-immediate">{assessment.level} RISK</div>
            <div className="mt-6 flex items-end justify-between gap-4 border-t border-[var(--color-line)] pt-4"><div><div className="eyebrow">POPULATION AT RISK</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{habitation?.population?.toLocaleString("en-IN") ?? "UNAVAILABLE"}</div></div><div className="text-right"><div className="eyebrow">PRIORITY</div><div className="mt-1 font-display text-xs font-semibold tracking-[0.12em] text-short">{habitation?.priority ?? "UNAVAILABLE"}</div></div></div>
          </div>
          <div className="p-5 lg:p-6">
            <div className="eyebrow">RISK → PRIORITY → ACTION</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[["01", "RISK LEVEL", assessment.level], ["02", "RELOCATION PRIORITY", habitation?.priority ?? "UNAVAILABLE"], ["03", "NEXT STEP", recommendationId ? "REVIEW" : "UNAVAILABLE"]].map(([number, label, value]) => <div key={label} className="border border-[var(--color-line)] bg-[var(--panel-wash)] p-3"><div className="metric text-[10px] text-[var(--color-fg-3)]">{number}</div><div className="eyebrow mt-3">{label}</div><div className="mt-1.5 font-display text-[12px] font-semibold tracking-[0.08em] text-[var(--color-fg)]">{value}</div></div>)}
            </div>
            <p className="mt-5 text-[13px] leading-6 text-[var(--color-fg-2)]">{assessment.summary}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
        <section className="panel p-5">
          <div className="flex items-end justify-between gap-3"><div><div className="eyebrow">CONTRIBUTION BREAKDOWN</div><h3 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-fg)]">Why is the risk high?</h3></div><span className="text-[10px] text-[var(--color-fg-3)]">Select a factor to inspect</span></div>
          <div className="mt-5 space-y-2">
            {factors.map((factor, index) => {
              const active = selected?.name === factor.name;
              return <button key={factor.name} type="button" onClick={() => setSelectedName(factor.name)} aria-pressed={active} className={`w-full border-b border-[var(--color-line)] px-2 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--hover-soft)] ${active ? "bg-[var(--hover-accent)]" : ""}`}>
                <div className="flex items-baseline justify-between gap-3"><span className="flex items-center gap-2"><span className="metric text-[10px] text-[var(--color-fg-3)]">{String(index + 1).padStart(2, "0")}</span><span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-2)]">{factor.name}</span></span><span className="metric text-sm font-semibold text-[var(--color-fg)]">+{factor.contribution.toFixed(1)}</span></div>
                <div className="bar-track mt-2 h-[7px]"><div className="bar-fill" style={{ width: `${Math.max((factor.contribution / max) * 100, 4)}%`, background: severityColor[factor.severity] ?? "var(--color-accent)" }} /></div>
              </button>;
            })}
          </div>
          {factors.length === 0 && <p className="mt-4 text-[12px] text-[var(--color-fg-3)]">No contribution data was supplied for this assessment.</p>}
        </section>

        <section className="panel p-5" aria-live="polite">
          <div className="flex items-center gap-2"><Info size={15} className="text-accent" aria-hidden="true" /><div className="eyebrow">EVIDENCE INSPECTOR</div></div>
          {selected && selectedEvidence ? <><h3 className="mt-3 font-display text-lg font-semibold text-[var(--color-fg)]">{selected.name}</h3><div className="mt-4 space-y-2"><div><div className="eyebrow">VALUE</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">+{selected.contribution.toFixed(1)}</div></div><EvidenceStatus label="Assessment factor" availability={selectedEvidence.availability} granularity={selectedEvidence.granularity} provenance={selectedEvidence.provenance} note={selectedEvidence.note} /></div></> : <p className="mt-4 text-[12px] leading-5 text-[var(--color-fg-3)]">Select a contribution to inspect its supplied value and evidence status.</p>}
        </section>
      </div>

      <section className="panel p-5"><div className="eyebrow">WHY THIS MATTERS</div><div className="mt-3 grid gap-3 md:grid-cols-3">{topThree.map((factor, index) => <div key={factor.name} className="flex gap-3 border-l-2 border-accent/50 pl-3"><span className="metric text-[10px] text-accent">{String(index + 1).padStart(2, "0")}</span><span className="text-[12px] font-medium text-[var(--color-fg-2)]">{factor.name}</span></div>)}</div></section>

      {assessment.warnings.length > 0 && <section className="border-y border-medium/30 bg-medium/[0.04] px-1 py-4"><div className="eyebrow text-medium">DATA COVERAGE NOTICE</div><p className="mt-1.5 text-[12px] leading-5 text-[var(--color-fg-2)]">Some contributors do not currently have complete habitation-level spatial evidence. The risk score above remains the persisted assessment; unavailable evidence is not treated as absence of risk.</p></section>}

      {recommendationId && <section className="panel flex flex-col items-start justify-between gap-4 border-accent/25 bg-accent/[0.04] p-5 sm:flex-row sm:items-center"><div><div className="eyebrow text-accent">NEXT STEP</div><div className="mt-1.5 font-display text-lg font-semibold text-[var(--color-fg)]">{assessment.score} {assessment.level} → {habitation?.priority ?? "REVIEW"} → Review recommendation</div></div><Link href={`/recommendations/${recommendationId}`} className="btn btn-primary btn-sm">View recommendation <ArrowRight size={13} /></Link></section>}
    </section>
  );
}
