"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, Search } from "lucide-react";
import { getDestinations } from "@/lib/api";
import { fmtNum } from "@/lib/format";
import type { Destination, DestinationStatus } from "@/types/api";
import PageHead from "@/components/layout/page-head";
import Stat from "@/components/ui/stat";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

const statuses: DestinationStatus[] = ["AVAILABLE", "LIMITED", "FULL", "UNSAFE"];

export function StatusBadge({ status }: { status: DestinationStatus }) {
  const tone =
    status === "AVAILABLE" ? "text-safe border-safe/40 bg-safe/10" : status === "LIMITED" ? "text-medium border-medium/40 bg-medium/10" : "text-immediate border-immediate/40 bg-immediate/10";
  return <span className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-display text-[9px] font-semibold tracking-[0.14em] ${tone}`}>{status}</span>;
}

function qualityTone(value: string) {
  if (value === "—") return "text-[var(--color-fg-3)]";
  if (["Good", "Low"].includes(value)) return "text-safe";
  if (["Fair", "Moderate"].includes(value)) return "text-medium";
  if (["Limited"].includes(value)) return "text-short";
  return "text-immediate";
}

function CapacityMeter({ destination }: { destination: Destination }) {
  const percent = destination.usableCapacity !== null && destination.nominalCapacity ? Math.min((destination.usableCapacity / destination.nominalCapacity) * 100, 100) : 0;
  const tone = destination.status === "AVAILABLE" ? "var(--color-safe)" : destination.status === "LIMITED" ? "var(--color-medium)" : "var(--color-immediate)";
  return (
    <div>
      <div className="bar-track h-[5px]">
        <div className="bar-fill" style={{ width: `${Math.max(percent, 2)}%`, background: tone }} />
      </div>
    </div>
  );
}

export default function DestinationsPage() {
  const [data, setData] = useState<Destination[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<DestinationStatus | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getDestinations()
      .then((items) => {
        if (active) {
          setData(items);
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
  }, [retry]);
  const filtered = useMemo(
    () => data.filter((item) => `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase()) && (status === "ALL" || item.status === status)),
    [data, query, status],
  );
  const summary = {
    total: data.length,
    available: data.filter((item) => item.status === "AVAILABLE").length,
    limited: data.filter((item) => item.status === "LIMITED").length,
    unavailable: data.filter((item) => item.status === "FULL" || item.status === "UNSAFE").length,
  };
  const retryLoad = () => {
    setError(false);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load destinations." onRetry={retryLoad} />;

  return (
    <div className="fade-up">
      <PageHead eyebrow="DESTINATION INTELLIGENCE" title="Relocation destination center" description="Assess relocation destinations by capacity, constraints, and available evidence.">
        <Link href="/destinations/compare" className="btn btn-outline btn-sm">
          <GitCompareArrows size={13} /> Compare destinations
        </Link>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] lg:grid-cols-4">
        {[
          ["TOTAL", summary.total, "text-[var(--color-fg)]"],
          ["AVAILABLE", summary.available, "text-safe"],
          ["LIMITED", summary.limited, "text-medium"],
          ["FULL / UNSAFE", summary.unavailable, "text-immediate"],
        ].map(([label, value, tone]) => (
          <div key={label as string} className="bg-surface p-4">
            <div className="eyebrow">{label}</div>
            <div className={`metric mt-2.5 text-2xl font-semibold leading-none ${tone}`}>{(value as number).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="panel mb-4 flex flex-col gap-2.5 p-2.5 sm:flex-row">
        <label className="field flex flex-1 items-center gap-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-fg-3)]" aria-hidden="true" />
          <span className="sr-only">Search destinations</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search destinations" className="w-full bg-transparent outline-none placeholder:text-[var(--color-fg-3)]" />
        </label>
        <select aria-label="Status filter" value={status} onChange={(event) => setStatus(event.target.value as DestinationStatus | "ALL")} className="field w-auto py-2 text-xs sm:w-44">
          <option value="ALL">All statuses</option>
          {statuses.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No destinations match the selected filters." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article key={item.id} className="panel hover-lift flex flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[5px] border border-[var(--color-line)] bg-elevated font-display text-[11px] font-semibold tracking-wide text-[var(--color-fg-2)]">{item.id}</span>
                  <div>
                    <h3 className="text-[14px] font-semibold leading-tight text-[var(--color-fg)]">{item.name}</h3>
                    <span className="mono mt-0.5 block text-[10px] text-[var(--color-fg-3)]">{item.id}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5"><StatusBadge status={item.status} /><DataProvenanceBadge provenance={item.dataOrigin} /></div>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 border-y border-[var(--color-line)] py-3">
                <div><div className="eyebrow">NOMINAL</div><div className="metric mt-1 text-lg font-semibold text-[var(--color-fg)]">{fmtNum(item.nominalCapacity)}</div></div>
                <div><div className="eyebrow">OCCUPIED</div><div className="metric mt-1 text-lg font-semibold text-[var(--color-fg)]">{fmtNum(item.currentOccupancy)}</div></div>
                <div><div className="eyebrow">USABLE</div><div className="metric mt-1 text-lg font-semibold text-accent">{fmtNum(item.usableCapacity)}</div></div>
              </div>
              <div className="mt-3"><CapacityMeter destination={item} /></div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-3.5">
                <Stat label="Hazard" value={<span className={qualityTone(item.hazardExposure)}>{item.hazardExposure}</span> as unknown as string} />
                <Stat label="Road" value={<span className={qualityTone(item.roadAccess)}>{item.roadAccess}</span> as unknown as string} />
                <Stat label="Healthcare" value={item.healthcareDistance} />
                <Stat label="Water" value={item.water} />
                <Stat label="Location" value={item.coordinates ? `${item.coordinates[0].toFixed(3)}, ${item.coordinates[1].toFixed(3)}` : "UNAVAILABLE"} />
              </div>

              <div className="mt-auto flex items-center justify-between border-t border-[var(--color-line)] pt-3.5">
                <Link href={`/destinations/${item.id}`} className="text-[11px] font-semibold text-accent transition-colors hover:text-[var(--color-fg)]">
                  Details
                </Link>
                <Link href={`/destinations/${item.id}/capacity`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent transition-colors hover:text-[var(--color-fg)]">
                  Capacity check <ArrowRight size={12} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
