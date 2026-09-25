"use client";

import Link from "next/link";
import { ArrowRight, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getDestinations, getHabitations, getRecommendations } from "@/lib/api";
import type { Destination, Habitation, Priority, Recommendation } from "@/types/api";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import PageHead from "@/components/layout/page-head";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import { entityCode, fmtNum } from "@/lib/format";

const priorities: Priority[] = ["IMMEDIATE", "SHORT-TERM", "MEDIUM-TERM"];
const tierCopy: Record<Priority, string> = {
  IMMEDIATE: "Immediate relocation review",
  "SHORT-TERM": "Short-term relocation planning",
  "MEDIUM-TERM": "Medium-term relocation planning",
};
const tierTone: Record<Priority, string> = {
  IMMEDIATE: "var(--color-immediate)",
  "SHORT-TERM": "var(--color-short)",
  "MEDIUM-TERM": "var(--color-medium)",
};

function CaseItem({ habitation, recommendation, destination, immediate }: { habitation: Habitation; recommendation?: Recommendation; destination?: Destination; immediate: boolean }) {
  return (
    <article className={`border-b border-[var(--color-line)] px-4 py-5 transition-colors last:border-b-0 hover:bg-[var(--hover-soft)] ${immediate ? "bg-[var(--row-accent)]" : ""}`}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_150px_180px_150px] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5"><span className="mono text-[10px] tracking-[0.14em] text-accent">{entityCode(habitation.name, habitation.id)}</span><PriorityBadge priority={habitation.priority} /><DataProvenanceBadge provenance={habitation.dataOrigin} /></div>
          <Link href={`/habitations/${habitation.id}`} className="mt-2 block truncate font-display text-lg font-semibold text-[var(--color-fg)] hover:text-accent">{habitation.name}</Link>
          <div className="mt-1 text-[11px] text-[var(--color-fg-2)]">{habitation.district ?? "District unavailable"} · {habitation.state ?? "State unavailable"}</div>
          <div className="mono mt-1 text-[10px] text-[var(--color-fg-3)]">{habitation.coordinates ? `${habitation.coordinates[0].toFixed(4)}, ${habitation.coordinates[1].toFixed(4)}` : "LOCATION UNAVAILABLE"}</div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-fg-3)]"><span>{habitation.hazard ?? "HAZARD EVIDENCE UNAVAILABLE"}</span><span>{habitation.factors?.length ? (habitation.warnings.length ? "PARTIAL EVIDENCE" : "EVIDENCE AVAILABLE") : "EVIDENCE UNAVAILABLE"}</span></div>
        </div>
        <div><div className="eyebrow">RISK</div><div className="mt-1.5"><RiskScore score={habitation.riskScore} level={habitation.riskLevel} compact /></div></div>
        <div><div className="eyebrow">PEOPLE AFFECTED</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(habitation.population)}</div><div className="mt-1 text-[10px] text-[var(--color-fg-3)]">{habitation.riskLevel ?? "RISK UNAVAILABLE"}</div></div>
        <div><div className="eyebrow">DESTINATION</div>{destination ? <><Link href={`/destinations/${destination.id}`} className="mt-1 block font-display text-sm font-semibold text-accent">{entityCode(destination.name, destination.id)}</Link><div className={`mt-1 text-[10px] font-semibold tracking-[0.1em] ${recommendation?.capacityStatus === "SUFFICIENT" ? "text-safe" : "text-immediate"}`}>{recommendation?.capacityStatus ?? destination.status}</div></> : <div className="mt-1 text-[11px] text-[var(--color-fg-3)]">UNAVAILABLE</div>}</div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-[var(--color-line)] pt-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div><div className="eyebrow">WHY THIS CASE IS PRIORITIZED</div>{recommendation?.reasons.length ? <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">{recommendation.reasons.slice(0, 3).map((reason) => <span key={reason} className="text-[11px] leading-5 text-[var(--color-fg-2)]">• {reason}</span>)}</div> : <p className="mt-2 text-[11px] text-[var(--color-fg-3)]">Priority rationale unavailable from the data service.</p>}</div>
        <div className="flex flex-wrap gap-2"><Link href={`/habitations/${habitation.id}`} className="btn btn-outline btn-sm">View dossier <ArrowRight size={12} /></Link><Link href={recommendation ? `/recommendations/${recommendation.id}` : `/habitations/${habitation.id}`} className={`btn btn-sm ${immediate ? "btn-primary" : "btn-outline"}`}>Review case <ArrowRight size={12} /></Link></div>
      </div>
    </article>
  );
}

export default function RelocationPriorityPage() {
  const [habitations, setHabitations] = useState<Habitation[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [filter, setFilter] = useState<Priority | "ALL">("ALL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

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
        if (active) { setError(true); setLoading(false); }
      });
    return () => { active = false; };
  }, [retry]);

  const filtered = useMemo(() => habitations.filter((item) => (filter === "ALL" || item.priority === filter) && `${item.id} ${item.name} ${item.district ?? ""}`.toLowerCase().includes(query.toLowerCase())), [filter, habitations, query]);
  const groups = priorities.map((priority) => ({ priority, items: filtered.filter((item) => item.priority === priority) }));
  const recommendationFor = (id: string) => recommendations.find((item) => item.habitationId === id);
  const destinationFor = (id: string) => { const recommendation = recommendationFor(id); return recommendation?.destinationId ? destinations.find((item) => item.id === recommendation.destinationId) : undefined; };
  const immediateCount = habitations.filter((item) => item.priority === "IMMEDIATE").length;
  const shortCount = habitations.filter((item) => item.priority === "SHORT-TERM").length;
  const mediumCount = habitations.filter((item) => item.priority === "MEDIUM-TERM").length;
  const peopleForReview = habitations.filter((item) => item.priority === "IMMEDIATE").reduce((total, item) => total + (item.population ?? 0), 0);
  const hasFilters = filter !== "ALL" || query !== "";
  const clearFilters = () => { setFilter("ALL"); setQuery(""); };
  const retryLoad = () => { setError(false); setLoading(true); setRetry((value) => value + 1); };

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load relocation priority data." onRetry={retryLoad} />;

  return (
    <div className="fade-up">
      <PageHead eyebrow="RELOCATION PRIORITY" title="Operational priority board" description="Operational ranking of habitations requiring relocation review."><span className="flex items-center gap-1.5 border border-insight/30 bg-insight/[0.06] px-2.5 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-insight"><span className="dot" style={{ background: "var(--color-insight)" }} aria-hidden="true" /> SYNTHETIC DEMO</span></PageHead>
      <section className="panel glow-top mb-5 overflow-hidden border-immediate/25"><div className="grid lg:grid-cols-[1.15fr_1fr]"><div className="border-b border-[var(--color-line)] p-5 lg:border-b-0 lg:border-r lg:p-6"><div className="eyebrow text-immediate">IMMEDIATE RELOCATION REVIEW</div><div className="metric mt-3 text-6xl font-semibold leading-none text-immediate">{immediateCount}</div><p className="mt-2 text-[12px] text-[var(--color-fg-2)]">Cases requiring officer review before other relocation planning.</p><div className="mt-5 border-t border-[var(--color-line)] pt-4"><div className="eyebrow">PEOPLE REQUIRING REVIEW</div><div className="metric mt-1 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(peopleForReview)}</div></div></div><div className="grid grid-cols-3 gap-px bg-[var(--color-line)]"><div className="bg-surface p-4"><div className="eyebrow">SHORT-TERM</div><div className="metric mt-2 text-3xl font-semibold text-short">{shortCount}</div></div><div className="bg-surface p-4"><div className="eyebrow">MEDIUM-TERM</div><div className="metric mt-2 text-3xl font-semibold text-medium">{mediumCount}</div></div><div className="bg-surface p-4"><div className="eyebrow">VISIBLE CASES</div><div className="metric mt-2 text-3xl font-semibold text-[var(--color-fg)]">{filtered.length}</div></div></div></div></section>
      <div className="panel mb-5 flex flex-col gap-3 p-2.5 lg:flex-row lg:items-center"><div className="flex flex-1 items-center gap-2.5"><Search size={15} className="text-[var(--color-fg-3)]" aria-hidden="true" /><label className="sr-only" htmlFor="priority-search">Search priority cases</label><input id="priority-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search habitation, ID, or district" className="w-full bg-transparent text-[13px] outline-none placeholder:text-[var(--color-fg-3)]" /></div><div className="flex flex-wrap gap-1.5">{["ALL", ...priorities].map((option) => <button key={option} type="button" onClick={() => setFilter(option as Priority | "ALL")} aria-pressed={filter === option} className={`btn btn-sm ${filter === option ? "btn-primary" : "btn-outline"}`}>{option}</button>)}</div>{hasFilters && <button type="button" onClick={clearFilters} className="btn btn-ghost btn-sm"><RotateCcw size={12} /> Clear filters</button>}</div>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[10px] font-semibold tracking-[0.12em] text-[var(--color-fg-3)]"><span>IDENTIFY</span><ArrowRight size={12} aria-hidden="true" /><span>UNDERSTAND RISK</span><ArrowRight size={12} aria-hidden="true" /><span className="text-accent">PRIORITIZE</span><ArrowRight size={12} aria-hidden="true" /><span>CHECK DESTINATION</span><ArrowRight size={12} aria-hidden="true" /><span>DECIDE</span></div>
      {filtered.length === 0 ? <EmptyState title="No cases match the current priority view." description="Try clearing the filter or changing the search term." /> : <div className="space-y-5">{groups.filter(({ priority }) => filter === "ALL" || filter === priority).map(({ priority, items }) => <section key={priority} aria-label={`${priority} priority cases`} className={`panel overflow-hidden ${priority === "IMMEDIATE" ? "border-immediate/35" : ""}`}><div className="flex flex-col justify-between gap-2 border-b px-4 py-4 sm:flex-row sm:items-center" style={{ borderColor: priority === "IMMEDIATE" ? "rgba(255,77,77,0.3)" : "var(--color-line)" }}><div className="flex items-center gap-3"><span className="tick" style={{ background: tierTone[priority], height: 22 }} aria-hidden="true" /><PriorityBadge priority={priority} /><div><h2 className="font-display text-[15px] font-semibold text-[var(--color-fg)]">{tierCopy[priority]}</h2><p className="mt-0.5 text-[11px] text-[var(--color-fg-3)]">{items.length} case{items.length === 1 ? "" : "s"} visible</p></div></div><span className="metric text-xs text-[var(--color-fg-3)]">{fmtNum(items.reduce((total, item) => total + (item.population ?? 0), 0))} PEOPLE</span></div>{items.length ? items.map((item) => <CaseItem key={item.id} habitation={item} recommendation={recommendationFor(item.id)} destination={destinationFor(item.id)} immediate={priority === "IMMEDIATE"} />) : <div className="p-4"><EmptyState title={`No ${priority.toLowerCase()} cases in this view.`} /></div>}</section>)}</div>}
  </div>
  );
}
