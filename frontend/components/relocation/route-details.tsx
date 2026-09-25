import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Destination } from "@/types/api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

/**
 * ROUTE DETAILS — everything the contract actually carries about getting from
 * habitation to destination: road access quality, destination hazard exposure,
 * capacity, coordinates. Distance / travel time / road geometry do not exist
 * in the contract and are declared unavailable, never estimated.
 */
export default function RouteDetails({ destination, habitationCode }: { destination: Destination; habitationCode: string }) {
  return (
    <section className="panel p-5" aria-label="Route details">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="eyebrow text-accent">ROUTE DETAILS</div>
          <h2 className="mt-1.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">
            {habitationCode} → {destination.name.split(" · ")[0]}
          </h2>
        </div>
        <DataProvenanceBadge provenance={destination.dataOrigin} />
      </div>

      {/* Distance & travel time — not present in any contract payload */}
      <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-line)]">
        {[
          ["DISTANCE", "ROAD GEOMETRY NOT AVAILABLE"],
          ["ESTIMATED TRAVEL TIME", "ROUTING SERVICE NOT CONNECTED"],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface p-3.5">
            <div className="eyebrow">{label}</div>
            <div className="mt-1.5 text-[11px] font-semibold tracking-[0.06em] text-[var(--color-fg-3)]">{value}</div>
          </div>
        ))}
      </div>

      {/* What the backend genuinely supplies about the journey */}
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-line)]">
        {[
          ["ROAD ACCESSIBILITY", destination.roadAccess || "NOT AVAILABLE"],
          ["ROUTE HAZARD EXPOSURE", destination.hazardExposure || "NOT AVAILABLE"],
          ["DESTINATION CAPACITY", destination.usableCapacity !== null ? `${destination.usableCapacity.toLocaleString("en-IN")} usable` : "NOT AVAILABLE"],
          ["BLOCKED ROADS", "NO BLOCKAGE DATA SUPPLIED"],
        ].map(([label, value]) => (
          <div key={label} className="bg-surface p-3.5">
            <div className="eyebrow">{label}</div>
            <div className="mt-1.5 font-display text-[13px] font-semibold text-[var(--color-fg)]">{value}</div>
          </div>
        ))}
      </div>

      <p className="mt-3 border-l-2 border-accent/50 pl-3 text-[11px] leading-5 text-[var(--color-fg-2)]">
        Recommendation considers available route, accessibility, hazard exposure, travel time and destination
        capacity — as supplied by the backend. Shortest distance is not automatically preferred.
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
        <span className="text-[10px] tracking-[0.1em] text-[var(--color-fg-3)]">
          {destination.coordinates ? `DEST AT ${destination.coordinates[0].toFixed(4)}, ${destination.coordinates[1].toFixed(4)}` : "DESTINATION LOCATION NOT AVAILABLE"}
        </span>
        <Link href={`/destinations/${destination.id}/capacity`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-[var(--color-fg)]">
          CAPACITY CHECK <ArrowRight size={11} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
