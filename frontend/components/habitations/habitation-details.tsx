"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { getHabitation, getHabitationRisk, getRecommendationFor } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { Habitation, Recommendation, RiskAssessment } from "@/types/api";
import OriginBadge from "@/components/ui/origin-badge";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import RiskExplanation from "@/components/habitations/risk-explanation";
import Stat from "@/components/ui/stat";
import { fmtCoords, fmtNum, fmtText } from "@/lib/format";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import SpatialEvidencePanel from "@/components/ui/spatial-evidence-panel";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import GISDataQualityPanel from "@/components/ui/gis-data-quality-panel";
import EvidenceSection from "@/components/habitations/evidence-section";
import ExplainPanel from "@/components/ui/explain-panel";
import CopilotDrawer from "@/components/ui/copilot-drawer";

const HazardMap = dynamic(() => import("@/components/map/hazard-map"), {
  ssr: false,
  loading: () => (
    <div className="panel grid-motif flex min-h-[420px] items-center justify-center">
      <span className="skeleton h-8 w-40" aria-label="Loading map" />
    </div>
  ),
});

export default function HabitationDetails({ id }: { id: string }) {
  const [habitation, setHabitation] = useState<Habitation>();
  const [assessment, setAssessment] = useState<RiskAssessment>();
  const [recommendation, setRecommendation] = useState<Recommendation>();
  const [riskUnavailable, setRiskUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [retry, setRetry] = useState(0);
  // Must be declared before any early return (Rules of Hooks)
  const [copilotOpen, setCopilotOpen] = useState(false);
  useEffect(() => {
    let active = true;
    Promise.all([getHabitation(id), getHabitationRisk(id).catch((e: unknown) => e), getRecommendationFor(id).catch((e: unknown) => e)])
      .then(([nextHabitation, riskOrError, recOrError]) => {
        if (!active) return;
        setHabitation(nextHabitation);
        if (riskOrError instanceof Error) {
          setAssessment(undefined);
          setRiskUnavailable(!(riskOrError instanceof ApiError && (riskOrError.status === 503 || riskOrError.status === 404)));
        } else {
          setAssessment(riskOrError as RiskAssessment);
          setRiskUnavailable(false);
        }
        setRecommendation(recOrError instanceof Error ? undefined : (recOrError as Recommendation));
        setLoading(false);
      })
      .catch((e: Error) => {
        if (active) {
          setError(e);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  const retryLoad = () => {
    setError(undefined);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load habitation information." onRetry={retryLoad} />;
  if (!habitation) return <EmptyState title="No habitation found" description={`No record is available for ${id}.`} />;

  const tone = habitation.priority === "IMMEDIATE" ? "var(--color-immediate)" : habitation.priority === "SHORT-TERM" ? "var(--color-short)" : "var(--color-medium)";
  const coordsLabel = fmtCoords(habitation.coordinates);
  const factors = assessment?.factors ?? habitation.factors ?? [];

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/habitations" className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
            ← BACK TO HABITATIONS
          </Link>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <span className="metric text-xs text-[var(--color-fg-3)]">ID {habitation.id}</span>
            <OriginBadge origin={habitation.dataOrigin} />
            <PriorityBadge priority={habitation.priority} />
            {coordsLabel && (
              <span className="flex items-center gap-1 text-[11px] text-[var(--color-fg-3)]">
                <MapPin size={11} aria-hidden="true" />
                {coordsLabel}
              </span>
            )}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">{habitation.name}</h1>
          <p className="mt-1 text-[12px] text-[var(--color-fg-3)]">
            {fmtText(habitation.village)} · {fmtText(habitation.district)}, {fmtText(habitation.state)}
          </p>
          <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--color-fg-3)]"><MapPin size={11} aria-hidden="true" />{coordsLabel ?? "LOCATION UNAVAILABLE"}<span aria-hidden="true">·</span><DataProvenanceBadge provenance={habitation.dataOrigin} /></div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setCopilotOpen(true)} className="btn btn-outline btn-sm border-accent/40 text-accent hover:bg-accent/10">
              ASK AVASYA COPILOT
            </button>
            <Link href="#risk-profile" className="btn btn-outline btn-sm">
              VIEW RISK EXPLANATION
            </Link>
            {recommendation && (
              <Link href={`/recommendations/${recommendation.id}`} className="btn btn-primary btn-sm">
                VIEW RELOCATION RECOMMENDATION <ArrowRight size={12} />
              </Link>
            )}
            <Link href="/relocation-priority" className="btn btn-ghost btn-sm">VIEW PRIORITY QUEUE <ArrowRight size={12} /></Link>
          </div>
        </div>
        {recommendation && (
          <Link href={`/recommendations/${recommendation.id}`} className="btn btn-primary btn-sm hidden lg:inline-flex">
            Review recommendation <ArrowRight size={13} />
          </Link>
        )}
      </div>

      {/* Hero: WHO + HOW URGENT */}
      <section className="panel glow-top mb-4 overflow-hidden border-accent/25">
        <div className="grid lg:grid-cols-[1.05fr_1.25fr_.8fr]">
          <div className="border-b border-[var(--color-line)] p-6 lg:border-b-0 lg:border-r">
            <div className="eyebrow text-accent">SITUATION AT A GLANCE</div>
            <div className="mt-4">
              <RiskScore score={habitation.riskScore} level={habitation.riskLevel} />
            </div>
            {riskUnavailable && (
              <p className="mt-3 max-w-52 text-[10px] leading-4 text-immediate">
                Risk assessment unavailable (503) — required evidence is missing at this granularity.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-3">
            {[
              ["POPULATION", fmtNum(habitation.population)],
              ["HOUSEHOLDS", fmtNum(habitation.households)],
              ["DISTRICT", fmtText(habitation.district)],
              ["STATE", fmtText(habitation.state)],
              ["DATA QUALITY", String(habitation.dataQuality ?? "UNKNOWN").toUpperCase()],
              ["CONFIDENCE", habitation.confidence !== null ? `${Math.round(habitation.confidence * 100)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <Stat label={label} value={value} />
              </div>
            ))}
          </div>
          <div className="border-t border-[var(--color-line)] p-6 lg:border-l lg:border-t-0">
            <div className="eyebrow text-immediate">RELOCATION STATUS</div>
            <div className="mt-3 font-display text-xl font-semibold text-immediate">{habitation.priority ?? "PRIORITY UNAVAILABLE"}</div>
            <div className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">{habitation.priority === "IMMEDIATE" ? "Relocation review required." : "Continue evidence-led review."}</div>
            <div className="mt-6 border-t border-[var(--color-line)] pt-4"><div className="eyebrow">PEOPLE AFFECTED</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(habitation.population)}</div></div>
          </div>
        </div>
        <div className="border-t border-[var(--color-line)] px-6 py-3">
          <span className="tick" style={{ background: tone }} aria-hidden="true" />
        </div>
      </section>

      {/* Evidence warnings — never fabricate, always expose */}
      {habitation.warnings.length > 0 && (
        <div className="panel mb-4 border-medium/30 bg-medium/[0.04] p-4">
          <div className="eyebrow text-medium">EVIDENCE WARNINGS</div>
          <ul className="mt-2 space-y-1.5">
            {habitation.warnings.map((warning) => (
              <li key={warning} className="flex gap-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
                <span aria-hidden="true" className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-medium" />
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="panel mb-4 p-5">
        <div className="flex items-start justify-between gap-3"><div><div className="eyebrow">PRIMARY HAZARD</div><h2 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-fg)]">{habitation.hazard ?? "Hazard evidence unavailable"}</h2></div><DataProvenanceBadge provenance={habitation.hazard ? habitation.dataOrigin : "UNAVAILABLE"} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3"><Stat label="EXPOSURE" value={habitation.hazard ? "SUPPLIED TO ASSESSMENT" : "UNAVAILABLE"} /><Stat label="SOURCE" value={habitation.hazardSource ?? "UNAVAILABLE"} /><Stat label="SPATIAL LEVEL" value={habitation.hazard ? "HABITATION / UNKNOWN" : "UNKNOWN"} /></div>
        <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[11px] leading-5 text-[var(--color-fg-3)]">Only hazard information supplied by the data service is shown. Missing hazard geometry is not interpreted as no hazard.</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4" id="risk-profile">
          <section className="panel p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="eyebrow">LOCATION</div>
                <h2 className="mt-1.5 font-display text-[17px] font-semibold text-[var(--color-fg)]">Habitation spatial record</h2>
              </div>
              <DataProvenanceBadge provenance={habitation.dataOrigin} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-4">
              {[
                ["LATITUDE", habitation.coordinates ? habitation.coordinates[0].toFixed(6) : "UNAVAILABLE"],
                ["LONGITUDE", habitation.coordinates ? habitation.coordinates[1].toFixed(6) : "UNAVAILABLE"],
                ["DISTRICT", habitation.district ?? "UNAVAILABLE"],
                ["STATE", habitation.state ?? "UNAVAILABLE"],
              ].map(([label, value]) => <div key={label} className="bg-surface p-3"><Stat label={label} value={value} /></div>)}
            </div>
          </section>
          <SpatialEvidencePanel habitation={habitation} />
          {habitation.coordinates && (
            <section className="panel overflow-hidden p-1">
              <div className="flex items-center justify-between px-3.5 pb-2.5 pt-3">
                <div>
                  <div className="eyebrow">MAP</div>
                  <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Location context</h2>
                </div>
                <Link href="/hazard-map" className="text-[11px] font-semibold text-accent hover:text-[var(--color-fg)]">
                  Full GIS view
                </Link>
              </div>
              <HazardMap habitations={[habitation]} selectedId={habitation.id} onSelect={() => undefined} className="[&_.maplibregl-canvas-container]:h-[380px] [&_.maplibregl-canvas-container]:min-h-0" />
            </section>
          )}
          {assessment ? (
            <RiskExplanation assessment={assessment} habitation={habitation} recommendationId={recommendation?.id} />
          ) : (
            <section className="panel p-5">
              <div className="eyebrow">RISK EXPLANATION</div>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-[var(--color-fg)]">Assessment pending</h2>
              <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
                No risk assessment has been computed for this habitation. AVASYA does not estimate values without
                persisted evidence — the backend reports evidence gaps rather than fabricating inputs.
              </p>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <GISDataQualityPanel habitations={[habitation]} />
          <section className="panel p-5">
            <div className="eyebrow">RISK COMPOSITION</div>
            <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Locked-model contributions</h2>
            {factors.length > 0 ? (
              <div className="mt-4 space-y-4">
                {factors.map((factor) => (
                  <div key={factor.name}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--color-fg-2)]">{factor.name}</span>
                      <span className="metric text-xs text-[var(--color-fg)]">+{factor.contribution.toFixed(1)}</span>
                    </div>
                    <div className="bar-track mt-2">
                      <div className="bar-fill" style={{ width: `${Math.min(factor.contribution * 2.4, 100)}%`, background: tone }} />
                    </div>
                  </div>
                ))}
                <p className="pt-1 text-[10px] leading-4 text-[var(--color-fg-3)]">
                  Weights locked by methodology: hazard 35% · population 20% · vulnerability 20% · historical 12% · road 13%.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-3)]">No contribution data persisted for this record.</p>
            )}
          </section>

          <section className="panel p-5">
            <div className="eyebrow">RELOCATION STATUS</div>
            <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Next action</h2>
            {recommendation ? (
              <>
                <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
                  {recommendation.destinationId ? (
                    <>
                      A recommendation to relocate to <span className="metric font-semibold text-[var(--color-fg)]">{recommendation.destinationId}</span> is awaiting officer review.
                    </>
                  ) : (
                    recommendation.summary
                  )}
                </p>
                <Link href={`/recommendations/${recommendation.id}`} className="btn btn-primary btn-sm mt-4 w-full">
                  Open recommendation <ArrowRight size={13} />
                </Link>
              </>
            ) : (
              <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
                No relocation recommendation has been issued for this habitation yet. Monitoring continues.
              </p>
            )}
          </section>
        </div>
      </div>

      {habitation && <EvidenceSection habitationId={habitation.id} />}
      {habitation && assessment && (
        <ExplainPanel habitation={habitation} assessment={assessment} recommendation={recommendation} />
      )}

      {copilotOpen && <CopilotDrawer habitation={habitation} onClose={() => setCopilotOpen(false)} />}
    </div>
  );
}
