"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, ShieldCheck, X } from "lucide-react";
import { getDestinations, getHabitations, getRecommendationFor, getRecommendations } from "@/lib/api";
import { entityCode, fmtNum, fmtScore } from "@/lib/format";
import type { Destination, Habitation, Recommendation } from "@/types/api";
import PriorityBadge from "@/components/ui/priority-badge";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import GISDataQualityPanel from "@/components/ui/gis-data-quality-panel";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import { API_MODE } from "@/lib/api";
import { readDecidedHabitationIds, readDecidedRecommendationIds } from "@/lib/decision-log";

/** Real Leaflet map on the dashboard — dynamically imported, SSR-safe. */
const DashboardMap = dynamic(() => import("@/components/map/hazard-map"), {
  ssr: false,
  loading: () => (
    <div className="grid-motif flex h-[min(56vh,520px)] min-h-[420px] items-center justify-center">
      <span className="skeleton h-8 w-40" aria-label="Loading map" />
    </div>
  ),
});

const riskTone = (priority: Habitation["priority"]) =>
  priority === "IMMEDIATE" ? "var(--color-immediate)" : priority === "SHORT-TERM" ? "var(--color-short)" : "var(--color-medium)";

/** Compact priority queue row — 01 / H001 / name / score / IMMEDIATE / people / destination. */
function QueueRow({ rank, habitation, destination }: { rank: number; habitation: Habitation; destination?: Destination }) {
  return (
    <div className="group flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-3 rounded-xl transition-colors last:border-b-0 hover:card-hover">
      <span className="metric w-6 shrink-0 text-[11px] text-[var(--color-fg-3)]">{String(rank).padStart(2, "0")}</span>
      <span className="h-6 w-1 rounded-full" style={{ background: riskTone(habitation.priority) }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="mono text-[10px] tracking-wide text-[var(--color-fg-3)]">{habitation.id}</span>
          <Link href={`/habitations/${habitation.id}`} className="truncate text-[13px] font-medium text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-fg)]">
            {habitation.name}
          </Link>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--color-fg-3)]">
          <span>{fmtNum(habitation.population)} people</span>
          <span aria-hidden="true">·</span>
          <span>Destination {destination ? entityCode(destination.name, destination.id) : "—"}</span>
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="flex items-baseline justify-end gap-1">
          <span className="metric text-lg font-semibold leading-none text-[var(--color-fg)]">{fmtScore(habitation.riskScore)}</span>
          <span className="metric text-[9px] text-[var(--color-fg-3)]">/100</span>
        </div>
        <PriorityBadge priority={habitation.priority} />
      </div>
      <Link
        href={`/recommendations/REC-${habitation.id}`}
        aria-label={`Review recommendation for ${habitation.name}`}
        className="btn btn-outline btn-sm rounded-xl shrink-0 opacity-80 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
      >
        REVIEW <ArrowRight size={11} />
      </Link>
    </div>
  );
}


/** §6 KPI command strip — counts derived from the loaded dataset only; no invented metrics. */
function KpiStrip({ items }: { items: { label: string; value: string; sub: string; tone?: string }[] }) {
  return (
    <section className="panel mb-4" aria-label="Operational metrics">
      <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-3 xl:grid-cols-5">
        {items.map((item) => (
          <div key={item.label} className="bg-surface px-4 py-3.5">
            <div className="eyebrow">{item.label}</div>
            <div className={`metric mt-1.5 text-2xl font-semibold leading-none ${item.tone ?? "text-[var(--color-fg)]"}`}>{item.value}</div>
            <div className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-[var(--color-fg-3)]">{item.sub}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SituationHero({ habitation, destination, recommendation }: { habitation: Habitation; destination?: Destination; recommendation?: Recommendation }) {
  const destinationCode = destination ? entityCode(destination.name, destination.id) : "UNAVAILABLE";
  const reviewHref = recommendation ? `/recommendations/${recommendation.id}` : `/habitations/${habitation.id}`;
  return (
    <section className="panel glow-top overflow-hidden border-accent/25">
      <div className="grid lg:grid-cols-[1.05fr_1.35fr]">
        <div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r lg:p-7">
          <div className="flex items-center justify-between gap-3">
            <div className="eyebrow text-accent">CURRENT SITUATION</div>
            <DataProvenanceBadge provenance={habitation.dataOrigin} />
          </div>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="mono text-[11px] tracking-[0.14em] text-[var(--color-fg-3)]">{entityCode(habitation.name, habitation.id)}</span>
            <PriorityBadge priority={habitation.priority} />
          </div>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-3xl">{habitation.name}</h2>
          <div className="mt-7 flex items-end gap-3">
            <span className="hero-stat">{fmtScore(habitation.riskScore)}</span>
            <span className="metric pb-1 text-sm text-[var(--color-fg-3)]">/ 100</span>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="tick" style={{ background: riskTone(habitation.priority), width: 18 }} aria-hidden="true" />
            <span className="font-display text-xs font-semibold tracking-[0.16em]" style={{ color: riskTone(habitation.priority) }}>{habitation.riskLevel ?? "RISK PENDING"} RISK</span>
          </div>
          <div className="mt-6 flex items-end justify-between gap-4 border-t border-[var(--color-line)] pt-4">
            <div><div className="eyebrow">PEOPLE AFFECTED</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(habitation.population)}</div></div>
            <Link href={reviewHref} className="btn btn-primary btn-sm">Review decision <ArrowRight size={13} /></Link>
          </div>
        </div>
        <div className="p-5 lg:p-7">
          <div className="eyebrow">DECISION PATH</div>
          <div className="mt-4 grid gap-2 sm:grid-cols-4">
            {[
              ["01", "RISK", `${fmtScore(habitation.riskScore)} ${habitation.riskLevel ?? "PENDING"}`, "text-immediate"],
              ["02", "PRIORITY", habitation.priority ?? "PENDING", "text-short"],
              ["03", "DESTINATION", destinationCode, "text-accent"],
              ["04", "DECISION", "OFFICER REVIEW", "text-safe"],
            ].map(([number, label, value, tone], index) => (
              <React.Fragment key={label}>
                <div className="border border-[var(--color-line)] bg-[var(--panel-wash)] p-3">
                  <div className="metric text-[10px] text-[var(--color-fg-3)]">{number}</div>
                  <div className="eyebrow mt-3">{label}</div>
                  <div className={`mt-1.5 font-display text-[12px] font-semibold tracking-[0.08em] ${tone}`}>{value}</div>
                </div>
                {index < 3 && <ArrowRight className="hidden self-center text-[var(--color-fg-3)] sm:block" size={14} aria-hidden="true" />}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-6 border-t border-[var(--color-line)] pt-4">
            <div className="eyebrow">RECOMMENDED DESTINATION</div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <div><div className="metric text-3xl font-semibold text-accent">{destinationCode}</div><div className="mt-1 text-[13px] font-medium text-[var(--color-fg)]">{destination?.name ?? "Destination evidence unavailable"}</div></div>
              <div className="text-right"><div className="eyebrow">CAPACITY</div><div className={`mt-1 font-display text-xs font-semibold tracking-[0.12em] ${recommendation?.capacityStatus === "SUFFICIENT" ? "text-safe" : "text-[var(--color-fg-3)]"}`}>{recommendation?.capacityStatus ?? "UNAVAILABLE"}</div></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DestinationPreview({ destination, recommendation }: { destination?: Destination; recommendation?: Recommendation }) {
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between gap-3"><div className="eyebrow text-accent">RECOMMENDED DESTINATION</div>{destination && <DataProvenanceBadge provenance={destination.dataOrigin} />}</div>
      {destination ? <>
        <div className="mt-3 flex items-end justify-between gap-3"><div><div className="metric text-3xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</div><h3 className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{destination.name}</h3></div><span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.12em] text-safe"><Check size={13} aria-hidden="true" />{recommendation?.capacityStatus ?? destination.status}</span></div>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-line)] pt-4"><div><div className="eyebrow">USABLE CAPACITY</div><div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(destination.usableCapacity)}</div></div><div><div className="eyebrow">ROAD ACCESS</div><div className="mt-1 text-[12px] font-medium text-[var(--color-fg)]">{destination.roadAccess || "EVIDENCE UNAVAILABLE"}</div></div></div>
        <Link href={`/recommendations/${recommendation?.id ?? "REC-1"}`} className="btn btn-outline btn-sm mt-4 w-full">View recommendation <ArrowRight size={12} /></Link>
      </> : <div className="mt-4 text-[12px] leading-5 text-[var(--color-fg-3)]">Destination evidence unavailable for the selected case.</div>}
    </section>
  );
}

function DecisionReasons({ recommendation }: { recommendation?: Recommendation }) {
  return <section className="panel p-5"><div className="eyebrow">WHY THIS DECISION?</div><h3 className="mt-1.5 font-display text-[17px] font-semibold text-[var(--color-fg)]">Evidence behind the recommendation</h3>{recommendation?.reasons.length ? <ol className="mt-4 space-y-3">{recommendation.reasons.slice(0, 4).map((reason, index) => <li key={reason} className="flex gap-3 text-[12px] leading-5 text-[var(--color-fg-2)]"><span className="metric flex h-5 w-5 shrink-0 items-center justify-center border border-accent/30 bg-accent/10 text-[10px] text-accent">{String(index + 1).padStart(2, "0")}</span><span>{reason}</span></li>)}</ol> : <p className="mt-3 text-[12px] text-[var(--color-fg-3)]">Recommendation rationale unavailable.</p>}</section>;
}

/** §15 map intelligence overlay — risk distribution counts over the map. */
function MapIntelOverlay({ immediate, high, medium, low }: { immediate: number; high: number; medium: number; low: number }) {
  const rows: [string, number, string][] = [
    ["IMMEDIATE", immediate, "var(--color-immediate)"],
    ["HIGH", high, "var(--color-short)"],
    ["MEDIUM", medium, "var(--color-medium)"],
    ["LOW", low, "var(--color-safe)"],
  ];
  return (
    <div className="pointer-events-none absolute right-4 top-4 z-[400] w-40 rounded-[6px] border border-[rgba(148,184,255,0.22)] bg-[var(--chrome-bg)] px-3 py-2.5 backdrop-blur-md">
      <div className="eyebrow mb-2">Risk distribution</div>
      <div className="space-y-1">
        {rows.map(([label, count, color]) => (
          <div key={label} className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 tracking-[0.1em] text-[var(--color-fg-2)]">
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: color }} aria-hidden="true" />
              {label}
            </span>
            <span className="metric font-semibold text-[var(--color-fg)]">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Focused intel card for the map-selected habitation - WHO / HOW URGENT / WHERE NEXT. */
function SelectedHabitationCard({
  habitation,
  destination,
  onClose,
}: {
  habitation: Habitation;
  destination?: Destination;
  onClose: () => void;
}) {
  return (
    <div className="modal-in pointer-events-auto absolute bottom-4 left-4 z-[500] w-[calc(100%-2rem)] max-w-xs overflow-hidden rounded-[6px] border border-[rgba(148,184,255,0.22)] bg-[var(--chrome-bg)] shadow-[0_16px_40px_var(--map-shadow)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--color-line)] px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="mono text-[10px] tracking-wide text-accent">{entityCode(habitation.name, habitation.id)}</span>
            <PriorityBadge priority={habitation.priority} />
          </div>
          <div className="mt-1 truncate font-display text-[13px] font-semibold text-[var(--color-fg)]">{habitation.name}</div>
        </div>
        <button aria-label="Clear map selection" className="btn-ghost shrink-0 rounded-[4px] p-1" onClick={onClose}>
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-px bg-[var(--color-line)]">
        <div className="bg-[var(--chrome-bg)] p-2.5">
          <div className="eyebrow">Risk</div>
          <div className="metric mt-1 text-lg font-semibold leading-none text-[var(--color-fg)]">{fmtScore(habitation.riskScore)}</div>
        </div>
        <div className="bg-[var(--chrome-bg)] p-2.5">
          <div className="eyebrow">People</div>
          <div className="metric mt-1 text-lg font-semibold leading-none text-[var(--color-fg)]">{fmtNum(habitation.population)}</div>
        </div>
        <div className="bg-[var(--chrome-bg)] p-2.5">
          <div className="eyebrow">Level</div>
          <div className="mt-1 font-display text-[11px] font-semibold tracking-wide text-[var(--color-fg)]">{habitation.riskLevel ?? "PENDING"}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="text-[10px] text-[var(--color-fg-3)]">
          Destination <span className="metric font-semibold text-[var(--color-fg-2)]">{destination ? entityCode(destination.name, destination.id) : "—"}</span>
        </span>
        <Link href={`/habitations/${habitation.id}`} className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
          VIEW DETAILS <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}

export default function CommandDashboard() {
  const [habitationalData, setHabitationalData] = useState<Habitation[]>([]);
  const [destinationData, setDestinationData] = useState<Destination[]>([]);
  const [recommendationData, setRecommendationData] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string>();
  const [decidedRecommendationIds, setDecidedRecommendationIds] = useState<Set<string>>(new Set());
  const [decidedHabitationIds, setDecidedHabitationIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    Promise.all([getHabitations(), getDestinations(), getRecommendations()])
      .then(([habitations, destinations, recommendations]) => {
        if (!active) return;
        setHabitationalData(habitations);
        setDestinationData(destinations);
        setRecommendationData(recommendations);
        setSelectedId(
          [...habitations]
            .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))[0]?.id,
        );
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setLoading(false);
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [retryKey]);

  useEffect(() => {
    const syncDecisions = () => {
      setDecidedRecommendationIds(readDecidedRecommendationIds());
      setDecidedHabitationIds(readDecidedHabitationIds());
    };
    syncDecisions();
    window.addEventListener("avasya:decisions", syncDecisions);
    return () => window.removeEventListener("avasya:decisions", syncDecisions);
  }, []);

  const pendingRecommendations = useMemo(
    () => recommendationData.filter((item) => !decidedRecommendationIds.has(item.id) && !decidedHabitationIds.has(item.habitationId)),
    [decidedHabitationIds, decidedRecommendationIds, recommendationData],
  );
  const pendingHabitationIds = useMemo(() => new Set(pendingRecommendations.map((item) => item.habitationId)), [pendingRecommendations]);
  const pendingHabitations = useMemo(
    () => habitationalData.filter((item) => !decidedHabitationIds.has(item.id) && (!recommendationData.some((rec) => rec.habitationId === item.id) || pendingHabitationIds.has(item.id))),
    [decidedHabitationIds, habitationalData, pendingHabitationIds, recommendationData],
  );

  const metrics = useMemo(
    () => ({
      immediate: pendingHabitations.filter((h) => h.priority === "IMMEDIATE").length,
      highRisk: pendingHabitations.filter((h) => h.riskLevel === "HIGH").length,
      populationAtRisk: pendingHabitations.filter((h) => h.riskLevel !== null && h.riskLevel !== "LOW").reduce((total, h) => total + (h.population ?? 0), 0),
      availableDestinations: destinationData.filter((d) => d.status === "AVAILABLE" && d.eligible).length,
    }),
    [pendingHabitations, destinationData],
  );

  const riskDistribution = useMemo(
    () =>
      [
        ["IMMEDIATE", "HIGH", "var(--color-immediate)"],
        ["HIGH", "HIGH", "var(--color-short)"],
        ["MEDIUM", "MEDIUM", "var(--color-medium)"],
        ["LOW", "LOW", "var(--color-safe)"],
      ].map(([label, level, color]) => ({
        label,
        value: pendingHabitations.filter((h) => h.riskLevel === level && (label === "IMMEDIATE" ? h.priority === "IMMEDIATE" : h.priority !== "IMMEDIATE")).length,
        color,
      })),
    [pendingHabitations],
  );

  const selected = pendingHabitations.find((habitation) => habitation.id === selectedId);

  const priorityQueue = useMemo(
    () =>
      pendingHabitations
        .filter((h) => h.priority !== "MEDIUM-TERM" || h.riskLevel === "HIGH")
        .sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1))
        .slice(0, 6),
    [pendingHabitations],
  );

  const featured = selected ?? priorityQueue[0];
  const featuredRecommendation = featured ? pendingRecommendations.find((item) => item.habitationId === featured.id) : undefined;
  const featuredDestination = featuredRecommendation ? destinationData.find((item) => item.id === featuredRecommendation.destinationId) : undefined;

  // The queue endpoint omits the rationale/reasons list. Fetch the featured
  // case's full recommendation so "Why this decision?" shows real evidence
  // instead of "Recommendation rationale unavailable.".
  const [featuredDetail, setFeaturedDetail] = useState<{
    habitationId: string;
    recommendation: Recommendation;
  } | null>(null);
  const featuredId = featured?.id;
  useEffect(() => {
    let active = true;
    if (!featuredId) return;
    getRecommendationFor(featuredId)
      .then((rec) => {
        if (active) setFeaturedDetail({ habitationId: featuredId, recommendation: rec });
      })
      .catch(() => {
        /* queue entry already carries summary/capacity; panel shows its fallback */
      });
    return () => {
      active = false;
    };
  }, [featuredId]);
  const displayRecommendation = featuredDetail?.habitationId === featuredId
    ? featuredDetail?.recommendation
    : featuredRecommendation;

  const retry = () => {
    setError(false);
    setLoading(true);
    setRetryKey((key) => key + 1);
  };

  // DATA SOURCE is provenance of the loaded records, not API health (audit
  // Part 15): a LIVE API serving a synthetic-seeded database is SYNTHETIC,
  // not "LIVE DATA".
  const loadedOrigin = useMemo(() => {
    const origins = new Set(habitationalData.map((item) => item.dataOrigin));
    if (origins.size === 0) return "UNAVAILABLE" as const;
    if (origins.size > 1) return "MIXED" as const;
    return [...origins][0];
  }, [habitationalData]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load operational data." onRetry={retry} />;
  if (habitationalData.length === 0)
    return <EmptyState title="No operational data available" description="No habitations have been returned by the data service." />;

  return (
    <div className="fade-up">
      {/* Command status header */}
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="eyebrow">RELOCATION COMMAND CENTER</div>
          <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">
            Disaster relocation decision support
          </h2>
          <div className="mt-2.5 flex items-center gap-2 text-[11px]">
            <span className="dot" style={{ background: loadedOrigin === "REAL" ? "var(--color-safe)" : "var(--color-insight)" }} aria-hidden="true" />
            <DataProvenanceBadge provenance={loadedOrigin} />
            <span className="font-display font-semibold tracking-[0.12em] text-[var(--color-fg-2)]">{API_MODE === "LIVE" ? "LIVE API" : "DEMO CLIENT"}</span>
            <span className="text-[var(--color-fg-3)]">· {pendingHabitations.length} ACTIVE CASES</span>
          </div>
        </div>
        <Link href="/recommendations" className="btn btn-primary">
          Review recommendations <ArrowRight size={14} />
        </Link>
      </div>

      {featured && <div className="mb-4"><SituationHero habitation={featured} destination={featuredDestination} recommendation={displayRecommendation} /></div>}

      <KpiStrip
        items={[
          { label: "HIGH RISK", value: String(metrics.highRisk), sub: "HABITATIONS" },
          { label: "IMMEDIATE", value: String(metrics.immediate), sub: "PRIORITY CASES", tone: "text-immediate" },
          { label: "PEOPLE AFFECTED", value: fmtNum(metrics.populationAtRisk), sub: "IN EXPOSED HABITATIONS" },
          { label: "DESTINATIONS", value: String(metrics.availableDestinations), sub: "CAPACITY-ELIGIBLE", tone: "text-accent" },
          { label: "RECOMMENDATIONS", value: String(recommendationData.length), sub: "SYSTEM RECOMMENDATIONS" },
        ]}
      />

      {/* Hero: map + priority queue */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <section className="panel glow-top relative overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <div>
              <div className="eyebrow">Risk overview</div>
              <h3 className="mt-1 font-display text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">Hazard exposure by habitation</h3>
            </div>
            <Link href="/hazard-map" className="text-[11px] font-semibold text-accent transition-colors hover:text-[var(--color-fg)]">
              Full GIS view
            </Link>
          </div>
          <DashboardMap
            habitations={pendingHabitations.filter((h) => h.priority !== null)}
            selectedId={selectedId}
            onSelect={(id) => setSelectedId((current) => (current === id ? undefined : id))}
            showPopups={false}
            destinations={destinationData}
            showDestinations
          />
          <MapIntelOverlay
            immediate={metrics.immediate}
            high={metrics.highRisk}
            medium={riskDistribution.find((r) => r.label === "MEDIUM")?.value ?? 0}
            low={riskDistribution.find((r) => r.label === "LOW")?.value ?? 0}
          />
          {selected && (
            <SelectedHabitationCard
              habitation={selected}
              destination={destinationData.find((d) => d.id === pendingRecommendations.find((r) => r.habitationId === selected.id)?.destinationId)}
              onClose={() => setSelectedId(undefined)}
            />
          )}
        </section>

        <section className="panel flex flex-col overflow-hidden border-immediate/25">
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <div>
              <div className="eyebrow">Urgency first</div>
              <h3 className="mt-1 font-display text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">Immediate action required</h3>
            </div>
            <Link href="/relocation-priority" className="text-[11px] font-semibold text-accent transition-colors hover:text-[var(--color-fg)]">
              Full board
            </Link>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {priorityQueue.map((habitation, index) => (
              <QueueRow
                key={habitation.id}
                rank={index + 1}
                habitation={habitation}
                destination={destinationData.find((d) => d.id === pendingRecommendations.find((r) => r.habitationId === habitation.id)?.destinationId)}
              />
            ))}
            {priorityQueue.length === 0 && <EmptyState title="No high-priority habitations found" />}
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DestinationPreview destination={featuredDestination} recommendation={displayRecommendation} />
        <DecisionReasons recommendation={displayRecommendation} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.25fr]">
        <GISDataQualityPanel habitations={habitationalData} />
        <section className="panel flex items-start gap-3.5 border-medium/25 bg-medium/[0.04] p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-medium/30 bg-medium/10 text-medium"><AlertTriangle size={17} aria-hidden="true" /></span>
          <div>
            <div className="eyebrow text-medium">DATA COVERAGE NOTICE</div>
            <p className="mt-1.5 text-[12px] leading-5 text-[var(--color-fg-2)]">Evidence availability varies by spatial granularity. Missing habitation-level evidence is not interpreted as absence of risk.</p>
          </div>
        </section>
      </div>

      {/* Officer authority strip */}
      <div className="panel mt-4 flex flex-col items-start justify-between gap-4 border-accent/25 bg-accent/[0.04] p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[5px] border border-accent/30 bg-accent/10 text-accent">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[var(--color-fg)]">AVASYA recommends. The authorized officer decides.</div>
            <p className="mt-0.5 text-[11px] text-[var(--color-fg-2)]">High-priority cases are surfaced with reasons and capacity evidence for review.</p>
          </div>
        </div>
        <Link href="/recommendations" className="btn btn-outline btn-sm shrink-0">
          Review recommendations
        </Link>
      </div>
    </div>
  );
}
