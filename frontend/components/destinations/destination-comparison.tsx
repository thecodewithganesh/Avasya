"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { getDestinations, getRecommendationFor } from "@/lib/api";
import type { Destination, Recommendation } from "@/types/api";
import { entityCode, fmtNum } from "@/lib/format";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

function qualityTone(value: string) {
  if (value === "—") return "text-[var(--color-fg-3)]";
  if (["Good", "Low"].includes(value)) return "text-safe";
  if (["Fair", "Moderate"].includes(value)) return "text-medium";
  if (["Limited"].includes(value)) return "text-short";
  return "text-immediate";
}

export default function DestinationComparison() {
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [retry, setRetry] = useState(0);
  const [simulatedUnavailable, setSimulatedUnavailable] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const rec = await getRecommendationFor("1").catch(() => undefined);
        const items = await getDestinations();
        if (!active) return;
        setDestinations(items);
        setRecommendation(rec);
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
  }, [retry]);
  const retryLoad = () => {
    setError(undefined);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load destination comparison." onRetry={retryLoad} />;
  if (destinations.length === 0) return <EmptyState title="No destination comparison available." description="No capacity assessments are present for the current candidate set." />;

  const options = destinations.slice(0, 4);
  const recommendedId = recommendation?.destinationId;
  const alternativeId = recommendation?.alternativeDestinationId;
  const displayedRecommendation = simulatedUnavailable && alternativeId ? destinations.find((item) => item.id === alternativeId) : destinations.find((item) => item.id === recommendedId);

  const numeric = (label: string, get: (item: Destination) => string) => [label, ...options.map(get)] as const;
  const rows: readonly (readonly [string, ...string[]])[] = [
    numeric("Capacity gate", (item) => (item.eligible ? "PASS" : "FAIL")),
    numeric("Nominal capacity", (item) => fmtNum(item.nominalCapacity)),
    numeric("Current occupancy", (item) => fmtNum(item.currentOccupancy)),
    numeric("Usable capacity", (item) => fmtNum(item.usableCapacity)),
    numeric("Required capacity", (item) => fmtNum(item.requiredCapacity)),
    numeric("Capacity gap", (item) => (item.capacityGap === null ? "—" : item.capacityGap >= 0 ? `+${fmtNum(item.capacityGap)}` : fmtNum(item.capacityGap))),
    numeric("Water constraint", (item) => fmtNum(item.waterConstraint)),
    numeric("Sanitation constraint", (item) => fmtNum(item.sanitationConstraint)),
    numeric("Safety reserve", (item) => fmtNum(item.safetyReserve)),
    numeric("Hazard exposure", (item) => item.hazardExposure),
    numeric("Road access", (item) => item.roadAccess),
    numeric("Healthcare distance", (item) => item.healthcareDistance),
    numeric("Provenance", (item) => item.dataOrigin),
  ];

  return (
    <div className="fade-up">
      <div className="mb-6">
        <Link href="/destinations" className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
          ← BACK TO DESTINATIONS
        </Link>
        <div className="eyebrow mt-3.5">DESTINATION COMPARISON</div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">Destination decision center</h1>
        <p className="mt-2 text-[13px] text-[var(--color-fg-2)]">
          {recommendation
            ? <>Evaluating relocation options for <span className="mono font-semibold text-[var(--color-fg)]">habitation {recommendation.habitationId}</span>.</>
            : "Candidate destinations and their capacity-gate standing."}
        </p>
      </div>

      {recommendation && <section className="panel glow-top mb-4 overflow-hidden border-accent/25"><div className="grid lg:grid-cols-[1fr_1fr_1fr]"><div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r"><div className="eyebrow">SOURCE HABITATION</div><div className="metric mt-2 text-2xl font-semibold text-[var(--color-fg)]">H{recommendation.habitationId.padStart(3, "0")}</div><div className="mt-1 text-[11px] text-[var(--color-fg-2)]">{recommendation.priority ?? "PRIORITY UNAVAILABLE"} · {recommendation.dataOrigin}</div></div><div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r"><div className="eyebrow">RECOMMENDED</div><div className="mt-2 metric text-3xl font-semibold text-accent">{simulatedUnavailable && alternativeId ? entityCode(destinations.find((item) => item.id === alternativeId)?.name, alternativeId) : entityCode(destinations.find((item) => item.id === recommendedId)?.name, recommendedId ?? "—")}</div><div className="mt-1 text-[11px] text-[var(--color-fg-2)]">{displayedRecommendation?.status ?? "UNAVAILABLE"} · {simulatedUnavailable ? "SIMULATION ONLY" : "BACKEND RECOMMENDATION"}</div></div><div className="p-5"><div className="eyebrow">WHAT-IF</div>{alternativeId ? <button type="button" onClick={() => setSimulatedUnavailable((value) => !value)} className="btn btn-outline btn-sm mt-2">{simulatedUnavailable ? "Restore original" : "Simulate unavailable"}</button> : <div className="mt-2 text-[11px] text-[var(--color-fg-3)]">Alternative destination unavailable</div>}</div></div></section>}

      <div className="panel overflow-x-auto">
        <table className="data-table min-w-[860px]">
          <thead>
            <tr>
              <th className="w-44">Measure</th>
              {options.map((destination) => {
                const isRecommended = destination.id === recommendedId;
                return (
                  <th key={destination.id} className={isRecommended ? "border-b-2 border-accent" : ""}>
                    <span className="metric block text-xs text-[var(--color-fg)]">{entityCode(destination.name, destination.id)}</span>
                    <span className="mt-0.5 block text-[11px] font-medium normal-case tracking-normal text-[var(--color-fg-2)]">{destination.name}</span>
                    <span className="mt-1.5 inline-flex"><DataProvenanceBadge provenance={destination.dataOrigin} /></span>
                    {isRecommended && (
                      <span className="mt-1.5 ml-1.5 inline-flex items-center gap-1 rounded-[3px] border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.12em] text-accent">
                        <Check size={10} aria-hidden="true" /> RECOMMENDED
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, ...values]) => (
              <tr key={label}>
                <td className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-3)]">{label}</td>
                {values.map((value, index) => (
                  <td key={`${label}-${index}`} className={index === 0 && options[0]?.id === recommendedId ? "border-l border-accent/15 bg-accent/[0.04]" : ""}>
                    {label === "Capacity gate" ? (
                      <span className={`inline-flex items-center gap-1 font-display text-[10px] font-semibold tracking-[0.12em] ${value === "PASS" ? "text-safe" : "text-immediate"}`}>
                        {value === "PASS" ? <Check size={12} aria-hidden="true" /> : <X size={12} aria-hidden="true" />}
                        {value}
                      </span>
                    ) : label === "Provenance" ? (
                      <span className={value === "REAL" ? "text-safe" : value === "MIXED" ? "text-accent" : "text-insight"}>{value === "SYNTHETIC_DEMO" ? "SYNTHETIC DEMO" : value}</span>
                    ) : ["Hazard exposure", "Road access", "Healthcare distance"].includes(label) ? (
                      <span className={qualityTone(value)}>{value}</span>
                    ) : (
                      <span className="metric text-[var(--color-fg)]">{value}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recommendation && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="panel border-accent/25 p-5">
            <div className="eyebrow text-accent">WHY THIS DESTINATION?</div>
            {recommendation.destinationId ? (
              <>
                <h2 className="mt-2 font-display text-lg font-semibold text-[var(--color-fg)]">Destination {recommendation.destinationId}</h2>
                <div className="mt-4 space-y-2.5">
                  {recommendation.reasons.map((reason) => (
                    <div key={reason} className="flex gap-2.5 text-[13px] text-[var(--color-fg-2)]">
                      <Check size={15} className="mt-0.5 shrink-0 text-safe" aria-hidden="true" />
                      {reason}
                    </div>
                  ))}
                </div>
                <Link href={`/destinations/${recommendation.destinationId}/capacity`} className="btn btn-outline btn-sm mt-5">
                  Open capacity check <ArrowRight size={12} />
                </Link>
              </>
            ) : (
              <>
                <h2 className="mt-2 font-display text-lg font-semibold text-immediate">NO_ELIGIBLE_DESTINATION</h2>
                <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">
                  Every candidate fails the capacity gate. No relocation can be recommended without new capacity evidence
                  or an officer override.
                </p>
              </>
            )}
          </section>
          <section className="panel p-5">
            <div className="eyebrow">TRADEOFFS</div>
            <h2 className="mt-2 font-display text-lg font-semibold text-[var(--color-fg)]">Why not the alternatives?</h2>
            <div className="mt-4 space-y-2.5">
              {recommendation.whyNot.length > 0 ? (
                recommendation.whyNot.map((alternative) => (
                  <div key={alternative.destination} className="flex gap-2.5 rounded-[5px] border border-[var(--color-line)] p-3 text-[13px] text-[var(--color-fg-2)]">
                    <X size={15} className="mt-0.5 shrink-0 text-immediate" aria-hidden="true" />
                    <span>
                      <strong className="block font-semibold text-[var(--color-fg)]">{alternative.destination}</strong>
                      {alternative.reason}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[var(--color-fg-3)]">No alternatives were rejected in the current assessment.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
