"use client";

import dynamic from "next/dynamic";
import type { Destination, Habitation } from "@/types/api";

const HazardMap = dynamic(() => import("@/components/map/hazard-map"), {
  ssr: false,
  loading: () => (
    <div className="panel grid-motif flex min-h-[420px] items-center justify-center">
      <span className="skeleton h-8 w-40" aria-label="Loading map" />
    </div>
  ),
});

/**
 * RELOCATION ROUTE MAP — origin habitation plus candidate destination markers
 * on the existing Leaflet/OSM map. Route polylines, blocked roads, and
 * alternate paths are not drawn because no road-network geometry exists in the
 * contract; the caption states this rather than implying the markers are a
 * route. Clicking a destination marker selects it.
 */
export default function RouteMap({
  habitation,
  destinations,
  recommendedId,
  onSelectDestination,
  className = "",
}: {
  habitation: Habitation;
  destinations: Destination[];
  recommendedId?: string | null;
  onSelectDestination?: (id: string) => void;
  className?: string;
}) {
  const mappable = destinations.filter((destination) => destination.coordinates !== null);
  return (
    <section className="panel overflow-hidden p-1" aria-label="Relocation route map">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 pb-2.5 pt-3">
        <div>
          <div className="eyebrow">ROUTE MAP</div>
          <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">
            Origin → candidate destinations
          </h2>
        </div>
        <span className="text-[9.5px] font-semibold tracking-[0.12em] text-[var(--color-fg-3)]">
          {mappable.length}/{destinations.length} DESTINATIONS PLOTTED
        </span>
      </div>
      <HazardMap
        habitations={[habitation]}
        selectedId={habitation.id}
        onSelect={() => undefined}
        destinations={destinations}
        showDestinations
        onSelectDestination={onSelectDestination}
        className={className}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-[10px] leading-4 text-[var(--color-fg-3)]">
        <span>
          ROAD GEOMETRY NOT AVAILABLE — markers show origin and destination locations only; no route line, blocked
          roads, or alternate paths are drawn because the backend supplies no road-network data.
        </span>
        {recommendedId && (
          <span className="shrink-0 font-semibold tracking-[0.1em] text-safe">◆ RECOMMENDED: {recommendedId}</span>
        )}
      </div>
    </section>
  );
}
