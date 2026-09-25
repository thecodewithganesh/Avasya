"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getDestinations } from "@/lib/api";
import { entityCode, fmtNum } from "@/lib/format";
import type { Destination } from "@/types/api";
import OriginBadge from "@/components/ui/origin-badge";
import Stat from "@/components/ui/stat";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import { StatusBadge } from "@/components/destinations/destinations-page";

function qualityTone(value: string) {
  if (value === "—") return "text-[var(--color-fg-3)]";
  if (["Good", "Low"].includes(value)) return "text-safe";
  if (["Fair", "Moderate"].includes(value)) return "text-medium";
  if (["Limited"].includes(value)) return "text-short";
  return "text-immediate";
}

export default function DestinationDetails({ id }: { id: string }) {
  const [destination, setDestination] = useState<Destination>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getDestinations()
      .then((items) => {
        if (active) {
          setDestination(items.find((item) => item.id === id));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  const retryLoad = () => {
    setError(false);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load destination information." onRetry={retryLoad} />;
  if (!destination) return <EmptyState title="No destination found." description={`No record is available for ${id}.`} />;

  return (
    <div className="fade-up">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/destinations" className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
            ← BACK TO DESTINATIONS
          </Link>
          <div className="mt-3.5 flex flex-wrap items-center gap-3">
            <span className="metric text-xs text-[var(--color-fg-3)]">{entityCode(destination.name, destination.id)}</span>
            <StatusBadge status={destination.status} />
            <OriginBadge origin={destination.dataOrigin} />
            <DataProvenanceBadge provenance={destination.coordinates ? destination.dataOrigin : "UNKNOWN"} />
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">{destination.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/destinations/${destination.id}/capacity`} className="btn btn-primary btn-sm">
            Capacity check <ArrowRight size={13} />
          </Link>
          <Link href="/destinations/compare" className="btn btn-outline btn-sm">
            Compare
          </Link>
        </div>
      </div>

      <section className="panel glow-top mb-4 overflow-hidden border-accent/25">
        <div className="grid lg:grid-cols-[1.3fr_1fr_.8fr]">
          <div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r lg:p-6"><div className="eyebrow text-accent">CAPACITY PROFILE</div><div className="mt-3 grid grid-cols-3 gap-4"><div><div className="eyebrow">NOMINAL</div><div className="metric mt-1 text-3xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.nominalCapacity)}</div></div><div><div className="eyebrow">OCCUPIED</div><div className="metric mt-1 text-3xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.currentOccupancy)}</div></div><div><div className="eyebrow">USABLE</div><div className="metric mt-1 text-3xl font-semibold text-accent">{fmtNum(destination.usableCapacity)}</div></div></div><div className="mt-5"><div className="bar-track h-[7px]"><div className="bar-fill" style={{ width: destination.usableCapacity !== null && destination.nominalCapacity ? `${Math.min((destination.usableCapacity / destination.nominalCapacity) * 100, 100)}%` : "0%", background: destination.status === "AVAILABLE" ? "var(--color-safe)" : "var(--color-medium)" }} /></div></div></div>
          <div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r lg:p-6"><div className="eyebrow">OPERATIONAL STATUS</div><div className="mt-3"><StatusBadge status={destination.status} /></div><p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-2)]">{destination.eligible ? "Capacity gate passed for this destination." : "Capacity gate did not pass for this destination."}</p><div className="mt-5 border-t border-[var(--color-line)] pt-4"><div className="eyebrow">SAFETY RESERVE</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.safetyReserve)}</div></div></div>
          <div className="p-5 lg:p-6"><div className="eyebrow">LOCATION</div><div className="mt-3 text-sm font-semibold text-[var(--color-fg)]">{destination.coordinates ? `${destination.coordinates[0].toFixed(5)}, ${destination.coordinates[1].toFixed(5)}` : "LOCATION DATA UNAVAILABLE"}</div><div className="mt-5"><DataProvenanceBadge provenance={destination.coordinates ? destination.dataOrigin : "UNAVAILABLE"} /></div></div>
        </div>
      </section>

      {/* Readiness grid */}
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--color-line)] px-5 py-3.5">
          <div className="eyebrow">SITE READINESS</div>
          <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Assessment supplied by the decision engine</h2>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] md:grid-cols-4">
          {[
            ["NOMINAL CAPACITY", fmtNum(destination.nominalCapacity)],
            ["HAZARD EXPOSURE", destination.hazardExposure, qualityTone(destination.hazardExposure)],
            ["ROAD ACCESS", destination.roadAccess, qualityTone(destination.roadAccess)],
            ["HEALTHCARE", destination.healthcareDistance],
            ["WATER", destination.water, qualityTone(destination.water)],
            ["SANITATION", destination.sanitation, qualityTone(destination.sanitation)],
            ["SAFETY RESERVE", fmtNum(destination.safetyReserve)],
            ["STATUS", destination.status],
          ].map(([label, value, tone]) => (
            <div key={label as string} className="bg-surface p-4">
              <Stat label={label as string} value={tone ? <span className={tone as string}>{value as string}</span> : (value as string)} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
