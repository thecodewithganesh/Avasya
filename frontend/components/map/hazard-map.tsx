"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Destination, Habitation } from "@/types/api";
import { entityCode, fmtNum, fmtScore } from "@/lib/format";
import { getHazardZones, type HazardZoneCollection } from "@/lib/gis-api";

/**
 * MapLibre GL hazard map — vector rendering, smooth zoom/rotate, GPU-accelerated
 * (replaces Leaflet raster tiles for the hazard workspace).
 *
 * Hazard bands (AVASYA OPERATIONAL METHODOLOGY, backend /api/v1/gis/hazard-zones):
 *   RED    — severity ≥ 75 (evacuation concern)
 *   YELLOW — severity 50–74 (watch)
 *   BROWN  — severity 25–49 (residual concern, below alert threshold)
 *   GREEN  — severity 0–24 (monitored, low)
 * Coastal hazard zones are clamped to the coastline: they start and stop at
 * the coast, never extending inland past the shore.
 *
 * Provenance rule: zone layers render only what the backend served. If the
 * zones fetch fails, the map renders habitations only — no fabricated GeoJSON.
 * Every zone carries its data_origin (SYNTHETIC_DEMO stays visibly labelled).
 */

const BAND_COLORS: Record<string, string> = {
  red: "#E5484D",
  yellow: "#F2B33D",
  brown: "#8A5A2B",
  green: "#3CB371",
};

const MARKER_COLORS = { immediate: "#FF4D4D", short: "#FF9F43", medium: "#F5C542", low: "#35C98B" };
const DESTINATION_COLOR = "#2BD9A3";

function markerColor(habitation: Habitation) {
  return habitation.priority === "IMMEDIATE"
    ? MARKER_COLORS.immediate
    : habitation.priority === "SHORT-TERM"
      ? MARKER_COLORS.short
      : habitation.riskLevel === "LOW"
        ? MARKER_COLORS.low
        : MARKER_COLORS.medium;
}

/** Free, keyless raster style — same OSM tiles as before, rendered by MapLibre. */
const OSM_STYLE: maplibregl.StyleSpecification = {
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
};

export interface HazardMapProps {
  habitations: Habitation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  className?: string;
  showPopups?: boolean;
  showHabitations?: boolean;
  destinations?: Destination[];
  showDestinations?: boolean;
  onSelectDestination?: (id: string) => void;
  /** Show the banded hazard-zone layers (RED/YELLOW/BROWN/GREEN). */
  showZones?: boolean;
  /** Highlight high-hazard traffic-risk locations inside RED/YELLOW zones. */
  showTrafficRisk?: boolean;
}

export default function HazardMap({
  habitations,
  selectedId,
  onSelect,
  className = "",
  showPopups = true,
  showHabitations = true,
  destinations,
  showDestinations = false,
  onSelectDestination,
  showZones = true,
  showTrafficRisk = true,
}: HazardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [zones, setZones] = useState<HazardZoneCollection | null>(null);
  const [zonesError, setZonesError] = useState(false);

  const selected = habitations.find((habitation) => habitation.id === selectedId);
  const selectable = showHabitations
    ? habitations.filter((h): h is Habitation & { coordinates: [number, number] } => h.coordinates !== null)
    : [];
  const mappableDestinations = showDestinations
    ? (destinations ?? []).filter((d): d is Destination & { coordinates: [number, number] } => d.coordinates !== null)
    : [];
  const mappable = [...habitations.filter((h): h is Habitation & { coordinates: [number, number] } => h.coordinates !== null), ...mappableDestinations];
  const center: [number, number] = selected?.coordinates ?? mappable[0]?.coordinates ?? [13.1, 79.5];

  const zoneGeojson = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!zones) return null;
    return { type: "FeatureCollection", features: zones.features };
  }, [zones]);

  // Load hazard zones once (layers render only backend-served geometry).
  useEffect(() => {
    if (!showZones) return;
    let active = true;
    getHazardZones()
      .then((collection) => {
        if (active) setZones(collection);
      })
      .catch(() => {
        if (active) setZonesError(true);
      });
    return () => {
      active = false;
    };
  }, [showZones]);

  // Initialize the map.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [center[1], center[0]],
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    map.on("load", () => setReady(true));
    return () => {
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fly to the selected habitation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected?.coordinates) return;
    map.flyTo({ center: [selected.coordinates[1], selected.coordinates[0]], zoom: Math.max(map.getZoom(), 12), duration: 600 });
  }, [selected]);

  // Add zone layers + markers once zones and the map are ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const sources: string[] = [];
    const layers: string[] = [];

    if (showZones && zoneGeojson && zoneGeojson.features.length > 0) {
      map.addSource("hazard-zones", { type: "geojson", data: zoneGeojson });
      sources.push("hazard-zones");
      // Draw green (safe) first so red sits on top.
      for (const band of ["green", "brown", "yellow", "red"] as const) {
        const layerId = `hazard-zone-${band}`;
        map.addLayer({
          id: layerId,
          type: "fill",
          source: "hazard-zones",
          filter: ["==", ["get", "band"], band],
          paint: {
            "fill-color": BAND_COLORS[band],
            "fill-opacity": band === "red" ? 0.34 : band === "yellow" ? 0.26 : 0.18,
          },
        });
        layers.push(layerId);
        const outlineId = `${layerId}-outline`;
        map.addLayer({
          id: outlineId,
          type: "line",
          source: "hazard-zones",
          filter: ["==", ["get", "band"], band],
          paint: { "line-color": BAND_COLORS[band], "line-width": band === "red" ? 2 : 1.2, "line-opacity": 0.85 },
        });
        layers.push(outlineId);
      }
      map.on("click", "hazard-zones", (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const props = feature.properties as HazardZoneCollection["features"][number]["properties"];
        const html = `
          <div style="min-width:190px;font-family:inherit">
            <div style="font-size:10px;letter-spacing:.1em;color:#8A919E">${props.hazard_type.toUpperCase()} ZONE — ${props.band.toUpperCase()}</div>
            <div style="margin-top:6px;font-size:12px;color:#E6E9EE">
              Severity ${props.severity_score ?? "unavailable"} · radius ${props.radius_m} m<br/>
              ${props.coast_clamped ? "Clamped to coastline ✓" : ""}<br/>
              <span style="font-size:10px;color:#8A919E">${props.data_origin} · AVASYA OPERATIONAL METHODOLOGY</span>
            </div>
          </div>`;
        new maplibregl.Popup({ closeButton: true, maxWidth: "240px" })
          .setLngLat(event.lngLat)
          .setHTML(html)
          .addTo(map);
      });
      map.on("mouseenter", "hazard-zones", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "hazard-zones", () => (map.getCanvas().style.cursor = ""));

      // High-hazard traffic-risk locations: habitation/destination points the
      // backend reports inside RED or YELLOW zones. A pulsing-style ring is
      // drawn around them to flag emergency-traffic focal points.
      if (showTrafficRisk && zones && zones.traffic_locations.length > 0) {
        const trafficGeojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: zones.traffic_locations
            .filter((t) => t.coordinates !== null)
            .map((t) => ({
              type: "Feature" as const,
              id: t.id,
              properties: { band: t.band, kind: t.kind, name: t.name },
              geometry: { type: "Point" as const, coordinates: t.coordinates as [number, number] },
            })),
        };
        map.addSource("traffic-risk", { type: "geojson", data: trafficGeojson });
        sources.push("traffic-risk");
        map.addLayer({
          id: "traffic-risk-ring",
          type: "circle",
          source: "traffic-risk",
          paint: {
            "circle-radius": 16,
            "circle-color": "transparent",
            "circle-stroke-color": ["match", ["get", "band"], "red", BAND_COLORS.red, BAND_COLORS.yellow],
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 0.9,
          },
        });
        layers.push("traffic-risk-ring");
      }
    }

    // Habitation + destination markers.
    for (const habitation of selectable) {
      const isSelected = selectedId === habitation.id;
      const color = markerColor(habitation);
      const marker = new maplibregl.Marker({
        color,
        scale: isSelected ? 1.35 : 1,
        anchor: "center",
      })
        .setLngLat([habitation.coordinates[1], habitation.coordinates[0]])
        .addTo(map);
      const element = marker.getElement();
      element.style.cursor = "pointer";
      element.setAttribute("aria-label", `Select habitation ${habitation.name}`);
      element.addEventListener("click", () => onSelect(habitation.id));
      if (showPopups) {
        const popup = new maplibregl.Popup({ closeButton: false, offset: 18, maxWidth: "240px" });
        marker.setPopup(
          popup.setDOMContent(buildHabitationPopup(habitation)),
        );
      }
      if (isSelected) marker.togglePopup();
    }

    for (const destination of mappableDestinations) {
      const isRecommended = destination.eligible;
      const marker = new maplibregl.Marker({
        color: DESTINATION_COLOR,
        scale: isRecommended ? 1.2 : 0.95,
        anchor: "center",
      })
        .setLngLat([destination.coordinates[1], destination.coordinates[0]])
        .addTo(map);
      if (onSelectDestination) {
        const element = marker.getElement();
        element.style.cursor = "pointer";
        element.addEventListener("click", () => onSelectDestination(destination.id));
      }
      if (showPopups) {
        const popup = new maplibregl.Popup({ closeButton: false, offset: 18, maxWidth: "240px" });
        marker.setPopup(popup.setDOMContent(buildDestinationPopup(destination)));
      }
    }

    return () => {
      // Teardown on re-render: remove popups' listeners implicitly by removing sources/layers.
      for (const layerId of layers) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const sourceId of sources) {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoneGeojson, selectedId, showZones, showPopups, showTrafficRisk, habitations, mappableDestinations]);

  if (!habitations.length)
    return <div className="panel grid-motif flex min-h-[500px] items-center justify-center p-8 text-sm text-[var(--color-fg-3)]">No habitations match the selected map filters.</div>;
  if (!mappable.length)
    return <div className="panel grid-motif flex min-h-[500px] items-center justify-center p-8 text-sm text-[var(--color-fg-3)]">None of the selected habitations have persisted coordinates.</div>;

  return (
    <div className={`relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] ${className}`}>
      <div ref={containerRef} aria-label="Interactive hazard map" className="h-[min(70vh,620px)] min-h-[500px] w-full" />
      {/* Legend sits bottom-left; lifted above the bottom edge so the selected-habitation
          card (also bottom-anchored) never overlaps it. */}
      <div className="pointer-events-none absolute bottom-[13.5rem] left-4 z-[400] rounded-[4px] border border-[var(--color-line)] bg-base/85 px-3 py-2.5 backdrop-blur-sm">
        <div className="eyebrow mb-2">HAZARD ZONES · AVASYA METHODOLOGY</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[9px] tracking-[0.1em] text-[var(--color-fg-2)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: BAND_COLORS.red, opacity: 0.85 }} />RED · SEVERITY ≥75</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: BAND_COLORS.yellow, opacity: 0.8 }} />YELLOW · 50–74</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: BAND_COLORS.brown, opacity: 0.8 }} />BROWN · 25–49</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: BAND_COLORS.green, opacity: 0.8 }} />GREEN · &lt;25</span>
          <span className="col-span-2 flex items-center gap-1.5 border-t border-[var(--color-line)] pt-1.5">
            <span className="h-[5px] w-[5px] rounded-full" style={{ background: MARKER_COLORS.immediate }} aria-hidden="true" />HABITATION
            <span className="ml-2 h-[5px] w-[5px] rounded-full" style={{ background: DESTINATION_COLOR }} aria-hidden="true" />DESTINATION
          </span>
          {zones?.coast_available && (
            <span className="col-span-2 text-[8px] text-[var(--color-fg-3)]">COASTAL ZONES CLAMPED TO COASTLINE · {zones.coast_clamped_count} CLAMPED</span>
          )}
        </div>
      </div>
      {zonesError && (
        <div className="absolute right-3 top-3 z-[400] rounded-[4px] border border-[var(--color-line)] bg-base/90 px-2.5 py-1.5 text-[9px] tracking-[0.1em] text-[var(--color-fg-2)] backdrop-blur-sm">
          ZONE LAYERS UNAVAILABLE — HABITATIONS ONLY
        </div>
      )}
      {zones && zones.data_origin === "SYNTHETIC_DEMO" && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-[400] -translate-x-1/2 rounded-[4px] border border-immediate/60 bg-immediate/15 px-3 py-1 text-[9px] font-semibold tracking-[0.14em] text-immediate backdrop-blur-sm">
          ⚠ SYNTHETIC DEMO ZONES · NOT REAL EVIDENCE
        </div>
      )}
    </div>
  );
}

function buildHabitationPopup(habitation: Habitation & { coordinates: [number, number] }): HTMLElement {
  const element = document.createElement("div");
  element.className = "min-w-48";
  element.innerHTML = `
    <span class="mono text-[10px] tracking-wide text-accent">${entityCode(habitation.name, habitation.id)}</span>
    <strong class="mt-1 block font-display text-sm text-[var(--color-fg)]">${habitation.name}</strong>
    <div class="mt-3 flex items-baseline justify-between gap-3">
      <span class="metric text-xl font-semibold text-[var(--color-fg)]">${fmtScore(habitation.riskScore)}<span class="text-[10px] text-[var(--color-fg-3)]"> /100</span></span>
      <span class="font-display text-[10px] font-semibold tracking-[0.1em] text-immediate">${habitation.priority ?? "PENDING"}</span>
    </div>
    <div class="mt-1 text-[11px] text-[var(--color-fg-2)]">${fmtNum(habitation.population)} people · ${habitation.riskLevel ?? "RISK UNAVAILABLE"}</div>
    <div class="mt-3 text-[11px] font-semibold text-accent"><a href="/habitations/${habitation.id}">OPEN INTELLIGENCE →</a></div>`;
  return element;
}

function buildDestinationPopup(destination: Destination & { coordinates: [number, number] }): HTMLElement {
  const element = document.createElement("div");
  element.className = "min-w-44";
  element.innerHTML = `
    <span class="mono text-[10px] tracking-wide text-safe">${destination.name}</span>
    <strong class="mt-1 block font-display text-sm text-[var(--color-fg)]">Relocation destination</strong>
    <div class="mt-3 flex items-baseline justify-between gap-3">
      <span class="metric text-xl font-semibold text-[var(--color-fg)]">${fmtNum(destination.usableCapacity)}</span>
      <span class="font-display text-[10px] font-semibold tracking-[0.1em] text-safe">USABLE</span>
    </div>
    <div class="mt-1 text-[11px] text-[var(--color-fg-2)]">${destination.status} · capacity ${destination.capacityGap === null ? "evidence unavailable" : destination.capacityGap >= 0 ? "sufficient" : "insufficient"}</div>`;
  return element;
}
