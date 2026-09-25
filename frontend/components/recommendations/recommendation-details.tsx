"use client";

import Link from "next/link";
import React, { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Play, RotateCcw, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { getDestinations, getHabitation, getHabitationRisk, getRecommendationFor } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { Destination, Habitation, Recommendation, RiskAssessment } from "@/types/api";
import OriginBadge from "@/components/ui/origin-badge";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import Stat from "@/components/ui/stat";
import { entityCode, entityName, fmtNum, fmtScore } from "@/lib/format";
import { DashboardSkeleton, EmptyState } from "@/components/ui/data-states";
import { TaxonomyErrorState } from "@/components/ui/error-state";
import SpatialEvidencePanel from "@/components/ui/spatial-evidence-panel";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

export default function RecommendationDetails({ id }: { id: string }) {
  const [recommendation, setRecommendation] = useState<Recommendation>();
  const [habitation, setHabitation] = useState<Habitation>();
  const [risk, setRisk] = useState<RiskAssessment>();
  const [destination, setDestination] = useState<Destination>();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [retry, setRetry] = useState(0);

  const resolveRecommendation = useCallback(async (routeId: string): Promise<Recommendation> => {
    const { getRecommendationById } = await import("@/lib/api");
    try {
      return await getRecommendationById(routeId);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // Try as habitation id (live routing: /recommendations/<habId>).
        return await getRecommendationFor(routeId);
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        // Route id is a recommendation id (mock "REC-<hab>") or a habitation id (live).
        const rec = await resolveRecommendation(id);
        const hab = await getHabitation(rec.habitationId);
        const riskResult = await getHabitationRisk(rec.habitationId).catch(() => undefined);
        const allDestinations = await getDestinations().catch(() => [] as Destination[]);
        const dest = rec.destinationId ? allDestinations.find((d) => d.id === rec.destinationId) : undefined;

        if (!active) return;
        setRecommendation(rec);
        setHabitation(hab);
        setRisk(riskResult);
        setDestinations(allDestinations);
        setDestination(dest);
        setLoading(false);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e : new Error("Load failed"));
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id, retry, resolveRecommendation]);

  const retryLoad = () => {
    setError(undefined);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error)
    return (
      <TaxonomyErrorState
        error={error}
        onRetry={retryLoad}
        headline="Unable to load relocation recommendation."
      />
    );
  if (!recommendation || !habitation) return <EmptyState title="No recommendation found." description={`No recommendation is available for ${id}.`} />;

  const alternative = recommendation.alternativeDestinationId ? destinations.find((d) => d.id === recommendation.alternativeDestinationId) : undefined;
  const noEligible = recommendation.summary === "NO_ELIGIBLE_DESTINATION" || !recommendation.destinationId;
  const currentDestination = unavailable && alternative ? alternative : destination;
  const displayWireId = recommendation.destinationWireId ?? (currentDestination ? Number(currentDestination.id) : null);

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <Link href="/recommendations" className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
            ← BACK TO RECOMMENDATIONS
          </Link>
          <div className="eyebrow mt-3.5">AVASYA RECOMMENDATION</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">{habitation.name}</h1>
            <OriginBadge origin={recommendation.dataOrigin} />
            <DataProvenanceBadge provenance={recommendation.dataOrigin} />
            <PriorityBadge priority={recommendation.priority} />
          </div>
          <div className="mono mt-1 text-[10px] text-[var(--color-fg-3)]">REC {recommendation.id.replace(/^REC-/, "")} · HAB {habitation.id}</div>
        </div>
        <div>
          <div className="eyebrow">RISK</div>
          <div className="mt-2">
            <RiskScore score={risk?.score ?? habitation.riskScore} level={risk?.level ?? habitation.riskLevel} compact />
          </div>
        </div>
      </div>

      {/* Recommendation hero */}
      <section className="panel mb-4 border-accent/30 glow-top">
        {/* §48 signature decision path — the whole pipeline in one glance */}
        <div className="glow-top relative flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--color-line)] px-5 py-3.5 overflow-x-auto" aria-label="Decision path: habitation to priority to destination to capacity to officer decision">
          {[
            [entityCode(habitation.name, habitation.id), "text-[var(--color-fg)]"],
            [recommendation.priority ?? "PENDING", recommendation.priority === "IMMEDIATE" ? "text-immediate" : "text-[var(--color-fg)]"],
            [currentDestination ? entityCode(currentDestination.name, currentDestination.id) : "NO DESTINATION", "text-accent"],
            [recommendation.capacityStatus, recommendation.capacityStatus === "SUFFICIENT" ? "text-safe" : "text-immediate"],
            ["OFFICER DECISION", "text-[var(--color-fg-2)]"],
          ].map(([label, tone], index) => (
            <React.Fragment key={`${label}-${index}`}>
              {index > 0 && <ArrowRight size={11} className="shrink-0 text-[var(--color-fg-3)]" aria-hidden="true" />}
              <span className={`font-display text-[10px] font-semibold tracking-[0.14em] ${tone}`}>{label}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="grid gap-px bg-[var(--color-line)] lg:grid-cols-[1.4fr_1fr]">
          <div className="bg-surface p-5">
            <div className="eyebrow">RECOMMENDED DESTINATION</div>
            {currentDestination ? (
              <>
                <div className="mt-2.5 flex flex-wrap items-baseline gap-3">
                  <span className="metric text-3xl font-semibold text-accent">{entityCode(currentDestination.name, currentDestination.id)}</span>
                  <span className="font-display text-lg font-semibold text-[var(--color-fg)]">{entityName(currentDestination.name)}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <span className="dot dot-safe" aria-hidden="true" />
                  <span className="text-[11px] font-semibold tracking-[0.1em] text-safe">
                    {recommendation.capacityStatus === "SUFFICIENT" ? "CAPACITY GATE PASSED" : "CAPACITY GATE FAILED"}
                  </span>
                  {currentDestination.usableCapacity !== null && (
                    <span className="text-[11px] text-[var(--color-fg-3)]">· USABLE {fmtNum(currentDestination.usableCapacity)}</span>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mt-2.5 font-display text-2xl font-semibold text-immediate">NO ELIGIBLE DESTINATION</div>
                <p className="mt-2 max-w-md text-[13px] leading-6 text-[var(--color-fg-2)]">
                  No destination currently passes the capacity eligibility gate. The system will not select an
                  insufficient shelter — relocation requires an officer override with a valid destination.
                </p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {currentDestination && (
                <Link href={`/destinations/${currentDestination.id}/capacity`} className="btn btn-primary btn-sm">
                  View capacity <ArrowRight size={12} />
                </Link>
              )}
              <Link href="/destinations/compare" className="btn btn-outline btn-sm">
                Compare destinations
              </Link>
            </div>
            {currentDestination && <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--color-line)] pt-4"><div><div className="eyebrow">NOMINAL</div><div className="metric mt-1 text-lg font-semibold text-[var(--color-fg)]">{fmtNum(currentDestination.nominalCapacity)}</div></div><div><div className="eyebrow">OCCUPIED</div><div className="metric mt-1 text-lg font-semibold text-[var(--color-fg)]">{fmtNum(currentDestination.currentOccupancy)}</div></div><div><div className="eyebrow">USABLE</div><div className="metric mt-1 text-lg font-semibold text-accent">{fmtNum(currentDestination.usableCapacity)}</div></div></div>}
          </div>
          <div className="grid grid-cols-2 gap-px bg-[var(--color-line)]">
            {[
              ["POPULATION", fmtNum(habitation.population)],
              ["RISK SCORE", `${fmtScore(risk?.score ?? habitation.riskScore)} / 100`],
              ["PRIORITY", recommendation.priority ?? "PENDING"],
              ["CONFIDENCE", recommendation.confidence !== null ? `${Math.round(recommendation.confidence * 100)}%` : "—"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <Stat label={label} value={value} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <SpatialEvidencePanel habitation={habitation} />
          {/* WHY */}
          <section className="panel p-5">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">
                {currentDestination ? `Why ${entityCode(currentDestination.name, currentDestination.id)}?` : "Why no destination?"}
              </h2>
            </div>
            <ol className="mt-4 space-y-2.5">
              {recommendation.reasons.map((reason, index) => (
                <li key={reason} className="flex items-start gap-3 text-[13px] text-[var(--color-fg-2)]">
                  <span className="metric mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-accent/30 bg-accent/10 text-[10px] font-semibold text-accent">
                    {index + 1}
                  </span>
                  {reason}
                </li>
              ))}
            </ol>
          </section>

          {/* WHY NOT — gate rejections */}
          <section className="panel p-5">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">Why not the alternatives?</h2>
            <p className="mt-1.5 text-[12px] text-[var(--color-fg-3)]">Destinations rejected by the capacity eligibility gate.</p>
            <div className="mt-4 space-y-2.5">
              {recommendation.whyNot.length > 0 ? (
                recommendation.whyNot.map((item) => (
                  <div key={item.destination} className="flex gap-3 rounded-[5px] border border-[var(--color-line)] p-3.5">
                    <X size={15} className="mt-0.5 shrink-0 text-immediate" aria-hidden="true" />
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-fg)]">{item.destination}</div>
                      <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-2)]">{item.reason}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[var(--color-fg-3)]">No alternative destinations were assessed.</p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          {/* What-if simulation */}
          {!noEligible && (
            <section className="panel border-medium/25 p-5">
              <div className="flex items-center gap-2">
                <TriangleAlert size={15} className="text-medium" aria-hidden="true" />
                <div className="eyebrow text-medium">SCENARIO SIMULATION</div>
                <span className="ml-auto rounded-[3px] border border-medium/40 bg-medium/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-medium">SIMULATION</span>
              </div>
              <h2 className="mt-2.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">What if {destination ? entityCode(destination.name, destination.id) : "this destination"} becomes unavailable?</h2>
              {!unavailable ? (
                <>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
                    Preview the recorded alternative if the recommended destination is lost. Nothing operational changes.
                  </p>
                  <p className="mt-1.5 rounded-[4px] border border-[var(--color-line)] bg-raised px-2.5 py-1.5 text-[11px] leading-4 text-[var(--color-fg-3)]">
                    Preview mode: this shows the alternative recorded at assessment time. A live re-run of the decision
                    pipeline (excluding the destination) is performed by the backend on the officer's request.
                  </p>
                  <button onClick={() => setUnavailable(true)} className="btn btn-outline btn-sm mt-4 w-full border-medium/40 text-medium hover:border-medium/60 hover:text-[var(--color-fg)]">
                    SIMULATE <Play size={11} className="inline" aria-hidden="true" />
                  </button>
                </>
              ) : alternative ? (
                <>
                  <div className="mt-3.5 space-y-2.5 rounded-[5px] border border-[var(--color-line)] bg-raised p-3.5">
                    <div className="flex items-center justify-between">
                      <span className="eyebrow">Original</span>
                      <span className="metric text-[13px] font-semibold text-[var(--color-fg-3)] line-through decoration-immediate/70">{destination ? entityCode(destination.name, destination.id) : "—"}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg-3)]">
                      <ArrowDown size={12} className="text-medium" aria-hidden="true" /> MARK DESTINATION UNAVAILABLE
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="eyebrow">Alternative</span>
                      <span className="metric text-[15px] font-semibold text-accent">{entityCode(alternative.name, alternative.id)}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-2)]">{recommendation.alternativeReason ?? "Fallback candidate."}</p>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/destinations/${alternative.id}/capacity`} className="btn btn-primary btn-sm flex-1">
                      View alternative
                    </Link>
                    <button onClick={() => setUnavailable(false)} className="btn btn-outline btn-sm">
                      <RotateCcw size={12} /> Restore
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
                    No alternative destination is present in the current recommendation data.
                  </p>
                  {recommendation.whyNot.length > 0 && (
                    <ul className="mt-2.5 space-y-1.5 text-[12px] leading-5 text-[var(--color-fg-2)]">
                      {recommendation.whyNot.map((item) => (
                        <li key={item.destination} className="flex items-start gap-2">
                          <X size={13} className="mt-0.5 shrink-0 text-immediate" aria-hidden="true" />
                          <span>
                            <span className="font-semibold text-[var(--color-fg)]">{item.destination}</span> — {item.reason}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button onClick={() => setUnavailable(false)} className="btn btn-outline btn-sm mt-4">
                    <RotateCcw size={12} /> Restore original
                  </button>
                </>
              )}
              <p className="mt-3.5 border-t border-[var(--color-line)] pt-3 text-[10px] leading-4 tracking-wide text-[var(--color-fg-3)]">
                SIMULATION ONLY — NO OPERATIONAL DECISION HAS BEEN CHANGED.
              </p>
            </section>
          )}

          {/* Decision CTA */}
          <section className="panel p-5">
            <div className="eyebrow">NEXT STEP</div>
            <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Record the officer decision</h2>
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
              AVASYA recommends. The authorized officer decides.
            </p>
            <Link href={`/recommendations/${recommendation.id}/decision`} className="btn btn-primary mt-4 w-full">
              Open officer decision <ArrowRight size={13} />
            </Link>
            {displayWireId !== null && (
              <p className="mono mt-3 text-center text-[10px] text-[var(--color-fg-3)]">RECOMMENDATION #{displayWireId}</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
