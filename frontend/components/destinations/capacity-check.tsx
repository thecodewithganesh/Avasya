"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, Check, TriangleAlert } from "lucide-react";
import { getDestinationCapacity, getDestinations } from "@/lib/api";
import type { CapacityCheck, Destination } from "@/types/api";
import OriginBadge from "@/components/ui/origin-badge";
import Stat from "@/components/ui/stat";
import { entityCode, fmtNum } from "@/lib/format";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

const steps = [
  ["Nominal capacity", (c: CapacityCheck) => c.nominalCapacity],
  ["Existing occupancy", (c: CapacityCheck) => c.currentOccupancy],
  ["Water constraint", (c: CapacityCheck) => c.waterConstraint],
  ["Sanitation constraint", (c: CapacityCheck) => c.sanitationConstraint],
  ["Safety reserve", (c: CapacityCheck) => c.reserves],
  ["Usable capacity", (c: CapacityCheck) => c.usableCapacity],
  ["Relocation requirement", (c: CapacityCheck) => c.requiredCapacity],
] as const;

export default function CapacityCheckPage({ id }: { id: string }) {
  const [destination, setDestination] = useState<Destination>();
  const [capacity, setCapacity] = useState<CapacityCheck>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([getDestinations().catch(() => [] as Destination[]), getDestinationCapacity(id)])
      .then(([destinations, assessment]) => {
        if (!active) return;
        setDestination(destinations.find((item) => item.id === id));
        setCapacity(assessment);
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
  if (error) return <ErrorState message="Unable to load capacity assessment." onRetry={retryLoad} />;
  if (!capacity) return <EmptyState title="No capacity assessment found." description={`No assessment is available for destination ${id}.`} />;

  const sufficient = capacity.eligibility;
  const verdictColor = sufficient ? "var(--color-safe)" : "var(--color-immediate)";

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/destinations" className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
            ← BACK TO DESTINATIONS
          </Link>
          <div className="eyebrow mt-3.5">CAPACITY CHECK</div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">
              {destination ? destination.name : `Destination ${id}`}
            </h1>
            <OriginBadge origin={capacity.dataOrigin} />
            <DataProvenanceBadge provenance={capacity.dataOrigin} />
          </div>
          <p className="mt-2 text-[13px] text-[var(--color-fg-2)]">
            usable = nominal − occupancy − water − sanitation − safety reserve · eligible ⇔ usable ≥ required
          </p>
        </div>
        {destination && destination.eligible && (
          <Link href="/destinations/compare" className="btn btn-outline btn-sm">
            Compare destinations
          </Link>
        )}
      </div>

      <section className="panel glow-top mb-4 overflow-hidden border-accent/25"><div className="grid lg:grid-cols-[1.2fr_1fr_.8fr]"><div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r"><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-2 text-5xl font-semibold text-accent">{fmtNum(capacity.usableCapacity)}</div><div className="mt-1 text-[11px] text-[var(--color-fg-3)]">backend-provided assessment</div></div><div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r"><div className="eyebrow">RELOCATION REQUIREMENT</div><div className="metric mt-2 text-4xl font-semibold text-[var(--color-fg)]">{fmtNum(capacity.requiredCapacity)}</div><div className="mt-1 text-[11px] text-[var(--color-fg-3)]">backend-provided requirement</div></div><div className="p-5"><div className="eyebrow">CAPACITY STATUS</div><div className={`mt-2 font-display text-lg font-semibold tracking-[0.08em] ${sufficient ? "text-safe" : "text-immediate"}`}>{capacity.status}</div><div className="mt-1 text-[11px] text-[var(--color-fg-3)]">{capacity.eligibility ? "ELIGIBLE" : "INELIGIBLE"}</div></div></div></section>

      <div className="grid gap-4 xl:grid-cols-[1fr_.62fr]">
        {/* Capacity flow — analytical centerpiece */}
        <section className="panel p-5">
          <div className="eyebrow">CAPACITY FLOW · M LOCKED FORMULA</div>
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">From nominal capacity to eligibility</h2>
          <div className="mt-5">
            {steps.map(([label, get], index) => {
              const value = get(capacity);
              const isUsable = label === "Usable capacity";
              const isRequirement = label === "Relocation requirement";
              const isDeduction = !isUsable && !isRequirement && index > 0;
              return (
                <div key={label}>
                  <div className="flex items-center gap-4">
                    <span className="metric w-6 shrink-0 text-center text-[10px] text-[var(--color-fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                    <div
                      className={`flex flex-1 items-center justify-between rounded-[5px] border px-4 py-3.5 ${isUsable ? "border-accent/40 bg-accent/[0.06]" : "border-[var(--color-line)] bg-raised"}`}
                    >
                      <span className={`text-[13px] ${isUsable || isRequirement ? "font-semibold text-[var(--color-fg)]" : "text-[var(--color-fg-2)]"}`}>
                        {isDeduction && <span className="mr-1.5 text-[var(--color-fg-3)]">−</span>}
                        {label}
                      </span>
                      <span className={`metric text-lg font-semibold ${isUsable ? "text-accent" : "text-[var(--color-fg)]"}`}>{fmtNum(value)}</span>
                    </div>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="ml-[11px] flex h-6 items-center" aria-hidden="true">
                      <ArrowDown size={13} className={isRequirement || isUsable ? "text-accent" : "text-[var(--color-fg-3)]"} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-[5px] border border-[var(--color-line)] bg-raised px-4 py-3">
            <span className="text-[13px] font-semibold text-[var(--color-fg)]">Capacity gap (usable − required)</span>
            <span className={`metric text-lg font-semibold ${capacity.capacityGap !== null && capacity.capacityGap >= 0 ? "text-safe" : "text-immediate"}`}>
              {capacity.capacityGap !== null ? (capacity.capacityGap >= 0 ? `+${fmtNum(capacity.capacityGap)}` : fmtNum(capacity.capacityGap)) : "—"}
            </span>
          </div>
          <p className="mt-4 border-t border-[var(--color-line)] pt-3.5 text-[11px] leading-5 text-[var(--color-fg-3)]">
            Values are supplied by the capacity assessment service; the frontend performs no calculation.
          </p>
        </section>

        <div className="space-y-4">
          {/* Verdict */}
          <section className="panel p-5" style={{ borderColor: `${verdictColor}44`, background: sufficient ? "rgba(53,201,139,0.05)" : "rgba(255,77,77,0.05)" }}>
            <div className="flex items-center gap-2.5">
              {sufficient ? <Check size={17} className="text-safe" aria-hidden="true" /> : <TriangleAlert size={17} className="text-immediate" aria-hidden="true" />}
              <div className="eyebrow">GATE VERDICT</div>
            </div>
            <div className="mt-3 font-display text-2xl font-semibold tracking-tight" style={{ color: verdictColor }}>
              {capacity.status}
            </div>
            <p className="mt-2.5 text-[13px] leading-6 text-[var(--color-fg-2)]">{capacity.eligibility ? "Capacity gate passed; this destination is eligible for selection." : "Capacity gate did not pass; this destination is not eligible for recommendation."}</p>
            {!sufficient && (
              <Link href="/destinations/compare" className="btn btn-outline btn-sm mt-4">
                Compare destinations <ArrowRight size={12} />
              </Link>
            )}
          </section>

          {/* Site conditions */}
          <section className="panel overflow-hidden">
            <div className="border-b border-[var(--color-line)] px-5 py-3.5">
              <div className="eyebrow">ASSESSMENT RECORD</div>
            </div>
            <div className="grid grid-cols-2 gap-px bg-[var(--color-line)]">
              {[
                ["DESTINATION", destination ? entityCode(destination.name, destination.id) : `#${capacity.destinationId}`],
                ["ELIGIBILITY", capacity.eligibility ? "ELIGIBLE" : "INELIGIBLE"],
                ["STATUS", capacity.status],
                ["PROVENANCE", capacity.dataOrigin],
              ].map(([label, value]) => (
                <div key={label} className="bg-surface p-4">
                  <Stat label={label} value={value} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
