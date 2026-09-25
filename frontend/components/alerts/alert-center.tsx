"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, ArrowRight, RotateCcw, Search } from "lucide-react";
import { getDestinations, getHabitations, getRecommendations } from "@/lib/api";
import type { Destination, Habitation, Recommendation, RiskLevel } from "@/types/api";
import PriorityBadge from "@/components/ui/priority-badge";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import PageHead from "@/components/layout/page-head";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import { entityCode, fmtNum } from "@/lib/format";
import { readDecidedHabitationIds } from "@/lib/decision-log";

/**
 * ALERT CENTER — the officer's entry point into the investigation workflow.
 * An alert exists for every habitation with a persisted risk assessment; risk,
 * priority, hazard, population, and data mode all come from the existing
 * contract. No synthetic urgency is invented for low-risk records.
 */

const riskTiers: (RiskLevel | "ALL")[] = ["ALL", "HIGH", "MEDIUM", "LOW"];

export default function AlertCenter() {
  const [habitations, setHabitations] = useState<Habitation[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [hazardFilter, setHazardFilter] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [decidedHabitationIds, setDecidedHabitationIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    Promise.all([getHabitations(), getRecommendations(), getDestinations()])
      .then(([nextHabitations, nextRecommendations, nextDestinations]) => {
        if (!active) return;
        setHabitations(nextHabitations);
        setRecommendations(nextRecommendations);
        setDestinations(nextDestinations);
        setLoading(false);
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

  useEffect(() => {
    const syncDecisions = () => setDecidedHabitationIds(readDecidedHabitationIds());
    syncDecisions();
    window.addEventListener("avasya:decisions", syncDecisions);
    return () => window.removeEventListener("avasya:decisions", syncDecisions);
  }, []);

  const hazards = useMemo(() => [...new Set(habitations.map((item) => item.hazard).filter(Boolean))] as string[], [habitations]);
  const recommendationsFor = (id: string) => recommendations.find((item) => item.habitationId === id);
  const activeHabitations = useMemo(
    () => habitations.filter((item) => !decidedHabitationIds.has(item.id)),
    [decidedHabitationIds, habitations],
  );

  const alerts = useMemo(
    () =>
      activeHabitations
        .filter((item) => item.riskLevel !== null)
        .filter((item) => riskFilter === "ALL" || item.riskLevel === riskFilter)
        .filter((item) => priorityFilter === "ALL" || item.priority === priorityFilter)
        .filter((item) => hazardFilter === "ALL" || item.hazard === hazardFilter)
        .filter((item) => `${item.id} ${item.name} ${item.district ?? ""}`.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
    [activeHabitations, riskFilter, priorityFilter, hazardFilter, query],
  );

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load the alert center." onRetry={() => { setError(false); setLoading(true); setRetry((value) => value + 1); }} />;

  const hasFilters = riskFilter !== "ALL" || priorityFilter !== "ALL" || hazardFilter !== "ALL" || query !== "";

  return (
    <div className="fade-up">
      <PageHead
        eyebrow="OFFICER ALERT CENTER"
        title="Active risk alerts"
        description="Habitations flagged by the rule engine for officer investigation. Alerts are generated from persisted risk assessments only."
      >
        <DataProvenanceBadge provenance={habitations.every((item) => item.dataOrigin === "SYNTHETIC_DEMO") ? "SYNTHETIC_DEMO" : "UNKNOWN"} />
      </PageHead>

      {/* Critical strip */}
      <section className="panel glow-top mb-4 overflow-hidden border-immediate/25">
        <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-4">
          {[
            { label: "ACTIVE ALERTS", value: alerts.length, tone: "text-[var(--color-fg)]" },
            { label: "HIGH RISK", value: activeHabitations.filter((item) => item.riskLevel === "HIGH").length, tone: "text-immediate" },
            { label: "IMMEDIATE REVIEW", value: activeHabitations.filter((item) => item.priority === "IMMEDIATE").length, tone: "text-immediate" },
            { label: "AWAITING DECISION", value: recommendations.filter((item) => !decidedHabitationIds.has(item.habitationId)).length, tone: "text-short" },
          ].map((cell) => (
            <div key={cell.label} className="bg-surface p-4">
              <div className="eyebrow">{cell.label}</div>
              <div className={`metric mt-1.5 text-3xl font-semibold ${cell.tone}`}>{cell.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Filters — only tiers/hazards that exist in the data */}
      <div className="panel mb-4 flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-fg-3)]" aria-hidden="true" />
          <label className="sr-only" htmlFor="alert-search">Search alerts</label>
          <input id="alert-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search habitation, ID, or district" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--color-fg-3)]" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {riskTiers.map((tier) => (
            <button key={tier} type="button" onClick={() => setRiskFilter(tier)} aria-pressed={riskFilter === tier} className={`btn btn-sm ${riskFilter === tier ? "btn-primary" : "btn-outline"}`}>
              {tier}
            </button>
          ))}
          <span className="mx-1 hidden h-4 w-px bg-[var(--color-line)] sm:block" aria-hidden="true" />
          {["ALL", "IMMEDIATE", "SHORT-TERM", "MEDIUM-TERM"].map((tier) => (
            <button key={tier} type="button" onClick={() => setPriorityFilter(tier)} aria-pressed={priorityFilter === tier} className={`btn btn-sm ${priorityFilter === tier ? "btn-primary" : "btn-outline"}`}>
              {tier}
            </button>
          ))}
        </div>
      </div>
      {hazards.length > 0 && (
        <div className="panel mb-4 flex flex-wrap items-center gap-1.5 p-3">
          <span className="eyebrow mr-1">HAZARD</span>
          {["ALL", ...hazards].map((hazard) => (
            <button key={hazard} type="button" onClick={() => setHazardFilter(hazard)} aria-pressed={hazardFilter === hazard} className={`btn btn-sm ${hazardFilter === hazard ? "btn-primary" : "btn-outline"}`}>
              {hazard}
            </button>
          ))}
          {hasFilters && (
            <button type="button" onClick={() => { setRiskFilter("ALL"); setPriorityFilter("ALL"); setHazardFilter("ALL"); setQuery(""); }} className="btn btn-ghost btn-sm ml-auto">
              <RotateCcw size={12} /> Clear filters
            </button>
          )}
        </div>
      )}

      {alerts.length === 0 ? (
        <EmptyState title="No alerts match the current filters." description="Clear the filters or adjust the search — alerts appear only for habitations with persisted risk assessments." />
      ) : (
        <div className="space-y-3">
          {alerts.map((habitation, index) => {
            const recommendation = recommendationsFor(habitation.id);
            const destination = recommendation?.destinationId ? destinations.find((item) => item.id === recommendation.destinationId) : undefined;
            const critical = habitation.riskLevel === "HIGH";
            return (
              <article key={habitation.id} className={`panel overflow-hidden transition-colors hover:border-accent/40 ${critical ? "border-immediate/30" : ""}`}>
                <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_130px_140px_130px_auto] lg:items-center lg:gap-5 lg:px-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[9px] font-semibold tracking-[0.14em] ${critical ? "border-immediate/40 text-immediate" : "border-[var(--color-line)] text-[var(--color-fg-3)]"}`}>
                        <BellRing size={10} aria-hidden="true" />
                        {critical ? "HIGH-PRIORITY ALERT" : "MONITOR ALERT"}
                      </span>
                      <span className="mono text-[10px] text-accent">ALERT-{String(index + 1).padStart(3, "0")}</span>
                      <DataProvenanceBadge provenance={habitation.dataOrigin} />
                    </div>
                    <Link href={`/habitations/${habitation.id}`} className="mt-2 block truncate font-display text-lg font-semibold text-[var(--color-fg)] hover:text-accent">
                      {entityCode(habitation.name, habitation.id)} — {habitation.name}
                    </Link>
                    <div className="mt-1 text-[11px] text-[var(--color-fg-2)]">
                      {habitation.hazard ?? "Hazard evidence unavailable"} · {habitation.priority === "IMMEDIATE" ? "Immediate review" : "Scheduled review"}
                    </div>
                    <div className="mono mt-1 text-[10px] text-[var(--color-fg-3)]">
                      {habitation.district ?? "DISTRICT UNAVAILABLE"} · RISK {habitation.riskScore ?? "—"}/100
                    </div>
                  </div>
                  <div>
                    <div className="eyebrow">RISK</div>
                    <div className="metric mt-1 text-xl font-semibold text-immediate">{habitation.riskScore ?? "—"}/100</div>
                    <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.1em] text-[var(--color-fg-3)]">{habitation.riskLevel ?? "UNKNOWN"}</div>
                  </div>
                  <div>
                    <div className="eyebrow">PEOPLE AFFECTED</div>
                    <div className="metric mt-1 text-xl font-semibold text-[var(--color-fg)]">{fmtNum(habitation.population)}</div>
                  </div>
                  <div>
                    <div className="eyebrow">STATUS</div>
                    <div className="mt-1.5"><PriorityBadge priority={habitation.priority} /></div>
                    {destination && <div className="mt-1 text-[9.5px] tracking-[0.08em] text-[var(--color-fg-3)]">REC → {destination.name.split(" · ")[0]}</div>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link href={`/habitations/${habitation.id}`} className={`btn btn-sm ${critical ? "btn-primary" : "btn-outline"}`}>
                      INVESTIGATE <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                    {recommendation && (
                      <Link href={`/recommendations/${recommendation.id}/decision`} className="btn btn-outline btn-sm" title="Open the officer decision center">
                        DECIDE
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
