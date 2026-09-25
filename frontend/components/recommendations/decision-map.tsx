"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";

const IMMEDIATE = "#FF4D4D";
const SAFE = "#35C98B";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
} as maplibregl.StyleSpecification;

/**
 * Location context for the decision page. Renders ONLY coordinates that exist
 * in the data — the source habitation and (when available) the recommended
 * destination. No route lines, roads, or hazard polygons are fabricated.
 * Migrated from react-leaflet to MapLibre GL (react-leaflet is no longer a
 * dependency).
 */
export default function DecisionMap({
  source,
  destination,
  sourceLabel,
  destinationLabel,
}: {
  source: [number, number] | null;
  destination: [number, number] | null;
  sourceLabel: string;
  destinationLabel: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const center: [number, number] = destination
      ? [(source![0] + destination[0]) / 2, (source![1] + destination[1]) / 2]
      : source!;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center[1], center[0]],
      zoom: destination ? 10 : 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      new maplibregl.Marker({ color: IMMEDIATE, anchor: "center" })
        .setLngLat([source![1], source![0]])
        .setPopup(new maplibregl.Popup({ closeButton: false, offset: 14 }).setText(`Source habitation · ${sourceLabel}`))
        .addTo(map);
      if (destination) {
        new maplibregl.Marker({ color: SAFE, anchor: "center" })
          .setLngLat([destination[1], destination[0]])
          .setPopup(new maplibregl.Popup({ closeButton: false, offset: 14 }).setText(`Destination · ${destinationLabel}`))
          .addTo(map);
      }
    });

    return () => map.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.[0], source?.[1], destination?.[0], destination?.[1]]);

  if (!source) {
    return (
      <div className="grid-motif flex h-44 items-center justify-center px-6 text-center text-[12px] leading-5 text-[var(--color-fg-3)]">
        The habitation record has no persisted coordinates, so no location context can be shown.
      </div>
    );
  }
  return (
    <div className="relative">
      <div ref={containerRef} className="h-52 w-full" />
      <div className="pointer-events-none absolute bottom-3 left-3 z-[400] flex flex-col gap-1 rounded-[4px] border border-[var(--color-line)] bg-[var(--chrome-bg)] px-2.5 py-2 backdrop-blur-sm">
        <span className="flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.12em] text-[var(--color-fg-2)]">
          <span className="h-[7px] w-[7px] rounded-full" style={{ background: IMMEDIATE }} aria-hidden="true" />
          SOURCE HABITATION
        </span>
        {destination ? (
          <span className="flex items-center gap-1.5 text-[9px] font-semibold tracking-[0.12em] text-[var(--color-fg-2)]">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: SAFE }} aria-hidden="true" />
            DESTINATION
          </span>
        ) : (
          <span className="text-[9px] tracking-[0.1em] text-[var(--color-fg-3)]">DESTINATION COORDINATES UNAVAILABLE</span>
        )}
      </div>
      <span className="sr-only">{`Map showing the source habitation${destination ? ` and the recommended destination ${destinationLabel}` : " only; destination coordinates are unavailable"}.`}</span>
    </div>
  );
}
