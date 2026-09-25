"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ArrowRight, Search, SlidersHorizontal } from "lucide-react";
import { getDestinations, getHabitations, getHazardStatuses, getResponseTime, getTransportPlan } from "@/lib/api";
import { getHazardZones, type HazardZoneCollection } from "@/lib/gis-api";
import type { HazardZoneFeature } from "@/lib/gis-api";
import type {
  Destination,
  Habitation,
  Priority,
  RiskLevel,
  WireHazardStatus,
  WireResponseTime,
  WireTransportPlan,
} from "@/types/api";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import { EmptyState, ErrorState, TileSkeleton } from "@/components/ui/data-states";
import { entityCode, fmtNum, fmtScore, fmtText } from "@/lib/format";
import MapLayerControl from "@/components/ui/map-layer-control";
import GISDataQualityPanel from "@/components/ui/gis-data-quality-panel";
import EvidenceStatus from "@/components/ui/evidence-status";

const HazardMap = dynamic(() => import("@/components/map/hazard-map"), {
  ssr: false,
  loading: () => (
    <div className="panel grid-motif flex min-h-[500px] items-center justify-center">
      <span className="skeleton h-8 w-40" aria-label="Loading map" />
    </div>
  ),
});

export default function HazardMapWorkspace() {
  const [data, setData] = useState<Habitation[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<Priority | "ALL">("ALL");
  const [risk, setRisk] = useState<RiskLevel | "ALL">("ALL");
  const [hazard, setHazard] = useState("ALL");
  const [habitationsVisible, setHabitationsVisible] = useState(true);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [destinationsVisible, setDestinationsVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [zones, setZones] = useState<HazardZoneCollection | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([getHabitations(), getDestinations()])
      .then(([items, destinationItems]) => {
        if (!active) return;
        setData(items);
        setDestinations(destinationItems);
        setSelectedId(items[0]?.id);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      });
    // Zone layers are supplementary: a fetch failure degrades the map to
    // habitations-only rather than failing the workspace.
    getHazardZones()
      .then((collection) => {
        if (active) setZones(collection);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [retry]);
  const hazards = useMemo(() => Array.from(new Set(data.map((item) => item.hazard).filter((h): h is string => Boolean(h)))), [data]);
  const filtered = useMemo(
    () =>
      data
        .filter(
          (item) =>
            `${item.id} ${item.name}`.toLowerCase().includes(query.toLowerCase()) &&
            (priority === "ALL" || item.priority === priority) &&
            (risk === "ALL" || item.riskLevel === risk) &&
            (hazard === "ALL" || item.hazard === hazard),
        )
        .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1)),
    [data, hazard, priority, query, risk],
  );
  const selected = filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const zoneForSelection = useMemo<HazardZoneFeature | null>(() => {
    if (!zones || !selected?.coordinates) return null;
    const [lat, lon] = selected.coordinates;
    // Simple point-in-ring test over the served zone polygons (demo scale).
    const inRing = (ring: number[][], lonX: number, latY: number) => {
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > latY !== yj > latY && lonX < ((xj - xi) * (latY - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    const bandRank = { red: 0, yellow: 1, brown: 2, green: 3 };
    const hits: HazardZoneFeature[] = [];
    for (const feature of zones.features) {
      const geometry = feature.geometry;
      const rings = geometry.type === "Polygon" ? [geometry.coordinates[0]] : geometry.coordinates.map((polygon) => polygon[0]);
      if (rings.some((ring) => inRing(ring, lon, lat))) hits.push(feature);
    }
    if (hits.length === 0) return null;
    return hits.sort((a, b) => bandRank[a.properties.band] - bandRank[b.properties.band])[0];
  }, [zones, selected]);
  const counts = {
    immediate: filtered.filter((item) => item.priority === "IMMEDIATE").length,
    shortTerm: filtered.filter((item) => item.priority === "SHORT-TERM").length,
    mediumTerm: filtered.filter((item) => item.priority === "MEDIUM-TERM").length,
  };
  const retryLoad = () => {
    setError(false);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading)
    return (
      <div className="fade-up space-y-4">
        <div className="skeleton h-9 w-96" />
        <TileSkeleton className="h-[520px]" />
      </div>
    );
  if (error) return <ErrorState message="Unable to load habitation map data." onRetry={retryLoad} />;
  return (
    <div className="fade-up">
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="eyebrow text-accent">HAZARD INTELLIGENCE</div>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Spatial risk intelligence</h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-fg-3)]">
            <span>{filtered.length} HABITATIONS</span>
            <span className="text-immediate">{counts.immediate} IMMEDIATE</span>
            <span className="text-short">{counts.shortTerm} SHORT-TERM</span>
            <span className="text-medium">{counts.mediumTerm} MEDIUM-TERM</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] tracking-[0.14em] text-[var(--color-fg-3)]">
          <span className="dot" style={{ background: "var(--color-insight)" }} aria-hidden="true" />
          GIS LAYER AVAILABLE · SYNTHETIC DEMO
        </div>
      </div>
      <div className="panel mb-4 flex flex-col gap-2.5 p-2.5 xl:flex-row">
        <label className="field flex flex-1 items-center gap-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-fg-3)]" aria-hidden="true" />
          <span className="sr-only">Search habitations</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID or habitation name" className="w-full bg-transparent outline-none placeholder:text-[var(--color-fg-3)]" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal size={14} className="text-[var(--color-fg-3)]" aria-hidden="true" />
          <select aria-label="Priority filter" value={priority} onChange={(event) => setPriority(event.target.value as Priority | "ALL")} className="field w-auto py-2 text-xs">
            <option value="ALL">All priorities</option>
            <option>IMMEDIATE</option>
            <option>SHORT-TERM</option>
            <option>MEDIUM-TERM</option>
          </select>
          <select aria-label="Risk level filter" value={risk} onChange={(event) => setRisk(event.target.value as RiskLevel | "ALL")} className="field w-auto py-2 text-xs">
            <option value="ALL">All risk levels</option>
            <option>HIGH</option>
            <option>MEDIUM</option>
            <option>LOW</option>
          </select>
          <select aria-label="Hazard filter" value={hazard} onChange={(event) => setHazard(event.target.value)} className="field w-auto py-2 text-xs">
            <option value="ALL">All hazards</option>
            {hazards.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No habitations match the selected filters." description="Try clearing a filter or changing the search term." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="order-2 panel flex max-h-[620px] flex-col overflow-hidden xl:order-none xl:col-start-1 xl:row-start-1 glow-top">
            <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
              <div>
                <div className="eyebrow">HABITATIONS</div>
                <h3 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Investigate risk</h3>
              </div>
              <span className="metric text-xs text-[var(--color-fg-3)]">{filtered.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.map((item, index) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`flex w-full items-center gap-3 border-b border-[var(--color-line)] px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-[var(--hover-soft)] ${selected?.id === item.id ? "bg-accent/[0.07]" : ""}`}
                >
                  <span className="metric w-5 shrink-0 text-[10px] text-[var(--color-fg-3)]">{String(index + 1).padStart(2, "0")}</span>
                  <span className="tick shrink-0" style={{ width: 3, height: 26, background: item.priority === "IMMEDIATE" ? "var(--color-immediate)" : item.priority === "SHORT-TERM" ? "var(--color-short)" : "var(--color-medium)" }} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="mono text-[10px] text-[var(--color-fg-3)]">{item.id}</span>
                      <span className="truncate text-[13px] font-medium text-[var(--color-fg)]">{item.name}</span>
                    </span>
                    <span className="mono mt-0.5 block text-[10px] text-[var(--color-fg-3)]">{fmtNum(item.population)} people · {fmtText(item.hazard)}</span>
                  </span>
                  <span className="shrink-0">
                    <RiskScore score={item.riskScore} level={item.riskLevel} compact />
                  </span>
                </button>
              ))}
            </div>
          </aside>
          <div className="order-1 xl:order-none xl:col-start-2 xl:row-start-1">
            <HazardMap
              habitations={filtered}
              selectedId={selected?.id}
              onSelect={setSelectedId}
              showHabitations={habitationsVisible}
              destinations={destinations}
              showDestinations={destinationsVisible}
            />
          </div>
          <aside className="order-3 flex max-h-[620px] flex-col gap-4 overflow-y-auto xl:order-none xl:col-start-3 xl:row-start-1">
            {selected && <ZoneBadge zone={zoneForSelection} />}
            <MapLayerControl
              habitationsVisible={habitationsVisible}
              onHabitationsChange={setHabitationsVisible}
              destinationsVisible={destinationsVisible}
              onDestinationsChange={setDestinationsVisible}
              destinationsAvailable={destinations.some((destination) => destination.coordinates !== null)}
            />
            <GISDataQualityPanel habitations={filtered} />
            <div className="panel flex flex-col overflow-hidden">
              {selected && <HazardStatusIntelligence wireId={selected.wireId} item={selected} factorNames={new Set((selected.factors ?? []).map((factor) => factor.name.toLowerCase()))} districtWarning={selected.warnings.some((warning) => /district|granularity|habitation/i.test(warning))} />}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Hazard-status intelligence (RED/YELLOW/NO_ALERT/DATA_UNAVAILABLE), response
 * urgency, and transport plan pulled LIVE from the intelligence endpoints.
 * Renders nothing extra in MOCK mode (the engines are backend-only).
 */
function HazardStatusIntelligence({
  wireId,
  item,
  factorNames,
  districtWarning,
}: {
  wireId: number;
  item: Habitation;
  factorNames: Set<string>;
  districtWarning: boolean;
}) {
  const [intelligence, setIntelligence] = useState<{
    wireId: number;
    hazards: WireHazardStatus[];
    response: WireResponseTime;
    transport: WireTransportPlan;
  } | { wireId: number; failed: true } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getHazardStatuses(String(wireId)), getResponseTime(String(wireId)), getTransportPlan(String(wireId))])
      .then(([hazardItems, responseItem, transportItem]) => {
        if (!active) return;
        setIntelligence({ wireId, hazards: hazardItems, response: responseItem, transport: transportItem });
      })
      .catch(() => {
        if (active) setIntelligence({ wireId, failed: true });
      });
    return () => {
      active = false;
    };
  }, [wireId]);

  const current = intelligence?.wireId === wireId ? intelligence : null;
  const failed = current !== null && "failed" in current;
  const hazards = current !== null && "hazards" in current ? current.hazards : null;
  const response = current !== null && "response" in current ? current.response : null;
  const transport = current !== null && "transport" in current ? current.transport : null;

  const statusColor = (status: string) =>
    status === "RED"
      ? "var(--color-immediate)"
      : status === "YELLOW"
        ? "var(--color-short)"
        : status === "NO_ALERT"
          ? "var(--color-medium)"
          : "var(--color-fg-3)";

  return (
    <>
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <div className="eyebrow text-accent">Spatial intelligence panel</div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="mono text-[11px] text-accent">{entityCode(item.name, item.id)}</span>
          <span className="truncate font-display text-[15px] font-semibold text-[var(--color-fg)]">{item.name}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <PriorityBadge priority={item.priority} />
          <span className="text-[10px] text-[var(--color-fg-3)]">{fmtText(item.hazard)}</span>
        </div>
      </div>
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <div className="eyebrow">00 · HAZARD STATUS · AVASYA OPERATIONAL METHODOLOGY</div>
        {failed && <div className="mt-2 text-[11px] text-[var(--color-fg-3)]">Intelligence engines require the LIVE API (backend).</div>}
        {!failed && hazards === null && <div className="skeleton mt-2 h-6 w-full" />}
        {hazards !== null && (
          <div className="mt-2 space-y-1.5">
            {hazards.map((hazard) => (
              <div key={`${hazard.hazard_id ?? "none"}-${hazard.hazard_type}`} className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] uppercase text-[var(--color-fg-3)]">{hazard.hazard_type}</span>
                <span className="flex items-center gap-1.5">
                  <span className="tick" style={{ width: 3, height: 14, background: statusColor(hazard.status) }} aria-hidden="true" />
                  <span className="text-[10px] font-semibold tracking-[0.08em]" style={{ color: statusColor(hazard.status) }}>{hazard.status}</span>
                </span>
              </div>
            ))}
            {response !== null && (
              <div className="mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-fg-2)]">
                <span className="eyebrow">RESPONSE POSTURE</span>
                <div className="mt-1 font-semibold" style={{ color: statusColor(response.hazard_status) }}>{response.urgency}</div>
                {response.estimated_transport_time_hours !== null && (
                  <div className="mono mt-0.5 text-[var(--color-fg-3)]">EST. TRANSPORT {response.estimated_transport_time_hours}h · BUFFER {response.buffer_hours}h</div>
                )}
                {response.estimated_transport_time_hours === null && (
                  <div className="mono mt-0.5 text-[var(--color-fg-3)]">TRANSPORT TIME DATA_UNAVAILABLE</div>
                )}
              </div>
            )}
            {transport !== null && transport.recommended_route !== null && (
              <div className="mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-fg-2)]">
                <span className="eyebrow">TRANSPORT PLAN</span>
                <div className="mt-1">→ {transport.recommended_route.destination_name}</div>
                <div className="mono text-[var(--color-fg-3)]">{transport.recommended_route.distance_km} km · {transport.recommended_route.travel_time_hours}h · route risk {transport.recommended_route.route_risk_score}</div>
              </div>
            )}
            {transport !== null && transport.recommended_route === null && (
              <div className="mono mt-2 border-t border-[var(--color-line)] pt-2 text-[10px] text-[var(--color-fg-3)]">NO FEASIBLE ROUTE (capacity gate / blocked roads)</div>
            )}
          </div>
        )}
      </div>
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <div className="eyebrow">01 · LOCATION &amp; ZONE</div>
        <div className="mt-2 text-[11px] leading-5 text-[var(--color-fg-2)]">{item.district ?? "District unavailable"} · {item.state ?? "State unavailable"}</div>
        <div className="mono mt-1 text-[10px] text-[var(--color-fg-3)]">{item.coordinates ? `${item.coordinates[0].toFixed(5)}, ${item.coordinates[1].toFixed(5)}` : "COORDINATES UNAVAILABLE"}</div>
      </div>
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <div className="eyebrow">02 · RISK</div>
        <div className="mt-2 flex items-baseline gap-2"><span className="metric text-3xl font-semibold text-[var(--color-fg)]">{fmtScore(item.riskScore)}</span><span className="metric text-[10px] text-[var(--color-fg-3)]">/ 100</span><span className="text-[11px] font-semibold tracking-[0.1em] text-immediate">{item.riskLevel ?? "PENDING"}</span></div>
        <div className="mt-1 text-[11px] text-[var(--color-fg-2)]"><span className="font-semibold text-[var(--color-fg)]">{item.priority ?? "PRIORITY UNAVAILABLE"}</span> · {fmtNum(item.population)} people</div>
      </div>
      <div className="border-b border-[var(--color-line)] px-4 py-3">
        <div className="eyebrow">03 · EVIDENCE</div>
        <div className="mt-1">
          <EvidenceStatus label="Hazard exposure" availability={factorNames.has("hazard exposure") ? "AVAILABLE" : "UNAVAILABLE"} granularity={factorNames.has("hazard exposure") ? "HABITATION" : "UNKNOWN"} provenance={factorNames.has("hazard exposure") ? item.dataOrigin : "UNAVAILABLE"} />
          <EvidenceStatus label="Vulnerability" availability={factorNames.has("vulnerability") ? "AVAILABLE" : "UNAVAILABLE"} granularity={factorNames.has("vulnerability") ? "HABITATION" : "UNKNOWN"} provenance={factorNames.has("vulnerability") ? item.dataOrigin : "UNAVAILABLE"} />
          <EvidenceStatus label="Historical evidence" availability="UNAVAILABLE" granularity={districtWarning ? "DISTRICT" : "UNKNOWN"} provenance={districtWarning ? item.dataOrigin : "UNAVAILABLE"} note={districtWarning ? "Not habitation-specific" : undefined} />
          <EvidenceStatus label="Road accessibility" availability={factorNames.has("road accessibility") ? "AVAILABLE" : "UNAVAILABLE"} granularity={factorNames.has("road accessibility") ? "HABITATION" : "UNKNOWN"} provenance={factorNames.has("road accessibility") ? item.dataOrigin : "UNAVAILABLE"} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--color-line)]">
        <div className="bg-surface p-3">
          <div className="eyebrow">NEXT ACTION</div>
          <div className="mt-1 text-[11px] text-[var(--color-fg-2)]">Review persisted risk and recommendation evidence.</div>
        </div>
      </div>
      <div className="mt-auto space-y-2 border-t border-[var(--color-line)] p-4">
        <Link href={`/habitations/${item.id}`} className="btn btn-outline btn-sm w-full">
          VIEW HABITATION <ArrowRight size={11} />
        </Link>
        <Link href={`/habitations/${item.id}`} className="btn btn-outline btn-sm w-full">
          VIEW RISK <Activity size={11} />
        </Link>
        <Link href={`/recommendations/REC-${item.id}`} className="btn btn-primary btn-sm w-full">
          VIEW RECOMMENDATION <ArrowRight size={11} />
        </Link>
      </div>
    </>
  );
}

/** Zone-membership card for the selected habitation; renders honestly when
 * the habitation sits outside every zone or when zone data is unavailable. */
function ZoneBadge({ zone }: { zone: HazardZoneFeature | null }) {
  if (!zone)
    return (
      <div className="panel p-4">
        <div className="eyebrow">HAZARD ZONE</div>
        <div className="mt-1.5 text-[11px] leading-5 text-[var(--color-fg-2)]">
          Outside all generated hazard zones (or zone layers unavailable). Zones are
declared only where hazard evidence exists — never inferred.
        </div>
      </div>
    );
  const props = zone.properties;
  return (
    <div className="panel p-4">
      <div className="eyebrow">HAZARD ZONE · AVASYA METHODOLOGY</div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-3 w-3 rounded-[3px]" style={{ background: props.band_color }} aria-hidden="true" />
        <span className="font-display text-[13px] font-semibold uppercase" style={{ color: props.band_color }}>
          {props.band} ZONE
        </span>
      </div>
      <div className="mt-2 space-y-1 text-[11px] leading-5 text-[var(--color-fg-2)]">
        <div>Hazard: <span className="font-semibold text-[var(--color-fg)]">{props.hazard_type}</span> · severity {props.severity_score ?? "unavailable"}</div>
        <div>Zone radius: {props.radius_m} m{props.coast_clamped ? " · clamped to coastline" : ""}</div>
        <div className="mono text-[9px] uppercase tracking-[0.1em] text-[var(--color-fg-3)]">{props.data_origin} · not real evidence unless labelled REAL</div>
      </div>
    </div>
  );
}
