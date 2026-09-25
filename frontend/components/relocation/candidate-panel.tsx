"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Destination } from "@/types/api";
import { getEligibleDestinations } from "@/lib/api";
import { FeasibilityBadge, deriveFeasibility } from "@/components/relocation/feasibility";
import { RowSkeleton } from "@/components/ui/data-states";

/**
 * CANDIDATE DESTINATIONS — every destination the API associates with this
 * habitation, with its capacity / hazard / accessibility facts. No ranking is
 * generated client-side; the RECOMMENDED marker reflects only the persisted
 * recommendation's destination.
 */
export default function CandidatePanel({
  habitationId,
  recommendedId,
  selectedId,
  onSelect,
}: {
  habitationId: string;
  recommendedId?: string | null;
  selectedId?: string;
  onSelect?: (id: string) => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "empty" | "unavailable">("loading");
  const [candidates, setCandidates] = useState<Destination[]>([]);

  useEffect(() => {
    let active = true;
    getEligibleDestinations(habitationId)
      .then((items) => {
        if (!active) return;
        setCandidates(items);
        setState(items.length > 0 ? "ready" : "empty");
      })
      .catch(() => active && setState("unavailable"));
    return () => {
      active = false;
    };
  }, [habitationId]);

  return (
    <section className="panel p-5" aria-label="Candidate destinations">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">CANDIDATE DESTINATIONS</div>
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">Assessed relocation options</h2>
          <p className="mt-1 text-[10.5px] leading-4 text-[var(--color-fg-3)]">Ordered as supplied by the backend — no client-side ranking.</p>
        </div>
      </div>

      {state === "loading" && <div className="mt-4 space-y-2">{[0, 1].map((row) => <RowSkeleton key={row} rows={1} />)}</div>}

      {state === "empty" && (
        <p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-2)]">No candidate destinations were returned for this habitation.</p>
      )}

      {state === "unavailable" && (
        <p className="mt-3 border border-immediate/30 bg-immediate/[0.05] p-3 text-[12px] leading-5 text-immediate" role="alert">
          Candidate assessment unavailable from the data service. Feasibility cannot be shown without it.
        </p>
      )}

      {state === "ready" && (
        <div className="mt-4 space-y-2.5">
          {candidates.map((candidate) => {
            const recommended = candidate.id === recommendedId;
            const selected = candidate.id === selectedId;
            const status = deriveFeasibility(candidate);
            return (
              <article
                key={candidate.id}
                className={`border p-3.5 transition-colors ${
                  selected ? "border-accent/60 bg-accent/[0.05]" : recommended ? "border-safe/40 bg-[var(--panel-wash)]" : "border-[var(--color-line)] bg-[var(--panel-wash)] hover:border-accent/40"
                }`}
              >
                <button type="button" onClick={() => onSelect?.(candidate.id)} className="w-full text-left" aria-pressed={selected}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <span className="metric text-sm font-semibold text-accent">{candidate.name.split(" · ")[0]}</span>
                      {recommended && <span className="rounded-[3px] border border-safe/40 px-1.5 py-0.5 text-[8.5px] font-semibold tracking-[0.12em] text-safe">RECOMMENDED</span>}
                    </span>
                    <FeasibilityBadge status={status} compact />
                  </div>
                </button>
                <dl className="mono mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] sm:grid-cols-4">
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Usable</dt>
                    <dd className="mt-0.5 text-[var(--color-fg-2)]">{candidate.usableCapacity !== null ? candidate.usableCapacity.toLocaleString("en-IN") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Required</dt>
                    <dd className="mt-0.5 text-[var(--color-fg-2)]">{candidate.requiredCapacity !== null ? candidate.requiredCapacity.toLocaleString("en-IN") : "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Hazard</dt>
                    <dd className="mt-0.5 text-[var(--color-fg-2)]">{candidate.hazardExposure || "N/A"}</dd>
                  </div>
                  <div>
                    <dt className="text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">Access</dt>
                    <dd className="mt-0.5 text-[var(--color-fg-2)]">{candidate.roadAccess || "N/A"}</dd>
                  </div>
                </dl>
                <div className="mt-2.5 flex items-center justify-between border-t border-[var(--color-line)] pt-2">
                  <span className="text-[9px] tracking-[0.1em] text-[var(--color-fg-3)]">
                    {candidate.coordinates ? `${candidate.coordinates[0].toFixed(4)}, ${candidate.coordinates[1].toFixed(4)}` : "DESTINATION LOCATION NOT AVAILABLE"}
                  </span>
                  <Link href={`/destinations/${candidate.id}/capacity`} className="text-[10px] font-semibold text-accent hover:text-[var(--color-fg)]">
                    DETAILS →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
