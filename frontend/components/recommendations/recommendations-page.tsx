"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { getDestinations, getHabitations, getRecommendations } from "@/lib/api";
import type { Destination, Habitation, Recommendation } from "@/types/api";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import PageHead from "@/components/layout/page-head";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import { entityCode, fmtNum } from "@/lib/format";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";
import { useMemo } from "react";
import { readDecidedRecommendationIds } from "@/lib/decision-log";

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [habitations, setHabitations] = useState<Habitation[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "IMMEDIATE" | "SHORT-TERM" | "MEDIUM-TERM">("ALL");
  const [decidedRecommendationIds, setDecidedRecommendationIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    let active = true;
    Promise.all([getRecommendations(), getHabitations(), getDestinations()])
      .then(([nextRecommendations, nextHabitations, nextDestinations]) => {
        if (active) {
          setRecommendations(nextRecommendations);
          setHabitations(nextHabitations);
          setDestinations(nextDestinations);
          setLoading(false);
        }
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
  }, [retry]);
  useEffect(() => {
    const syncDecisions = () => setDecidedRecommendationIds(readDecidedRecommendationIds());
    syncDecisions();
    window.addEventListener("avasya:decisions", syncDecisions);
    return () => window.removeEventListener("avasya:decisions", syncDecisions);
  }, []);
  const retryLoad = () => {
    setError(false);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  const pendingRecommendations = useMemo(() => recommendations.filter((item) => !decidedRecommendationIds.has(item.id)), [decidedRecommendationIds, recommendations]);
  const visibleRecommendations = useMemo(() => pendingRecommendations.filter((item) => priorityFilter === "ALL" || item.priority === priorityFilter), [pendingRecommendations, priorityFilter]);
  const immediate = pendingRecommendations.filter((item) => item.priority === "IMMEDIATE").length;
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load relocation recommendations." onRetry={retryLoad} />;

  return (
    <div className="fade-up">
      <PageHead
        eyebrow="RECOMMENDATION INTELLIGENCE"
        title="Officer decision queue"
        description="Review AI-assisted relocation recommendations before officer approval."
      >
        <DataProvenanceBadge provenance={recommendations.every((item) => item.dataOrigin === "SYNTHETIC_DEMO") ? "SYNTHETIC_DEMO" : "UNKNOWN"} />
      </PageHead>

      <section className="panel glow-top mb-4 overflow-hidden border-accent/25"><div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-4"><div className="bg-surface p-4"><div className="eyebrow">PENDING REVIEW</div><div className="metric mt-2 text-3xl font-semibold text-[var(--color-fg)]">{pendingRecommendations.length}</div></div><div className="bg-surface p-4"><div className="eyebrow">IMMEDIATE</div><div className="metric mt-2 text-3xl font-semibold text-immediate">{immediate}</div></div><div className="bg-surface p-4"><div className="eyebrow">CAPACITY SUFFICIENT</div><div className="metric mt-2 text-3xl font-semibold text-safe">{pendingRecommendations.filter((item) => item.capacityStatus === "SUFFICIENT").length}</div></div><div className="bg-surface p-4"><div className="eyebrow">OFFICER DECISION</div><div className="mt-3 text-[11px] font-semibold tracking-[0.1em] text-accent">REQUIRED</div></div></div></section>
      <div className="mb-4 flex flex-wrap gap-1.5">{["ALL", "IMMEDIATE", "SHORT-TERM", "MEDIUM-TERM"].map((option) => <button key={option} type="button" onClick={() => setPriorityFilter(option as "ALL" | "IMMEDIATE" | "SHORT-TERM" | "MEDIUM-TERM")} aria-pressed={priorityFilter === option} className={`btn btn-sm ${priorityFilter === option ? "btn-primary" : "btn-outline"}`}>{option}</button>)}</div>

      {visibleRecommendations.length === 0 ? (
        <EmptyState title="No recommendations available." description="The decision engine has not returned any recommendations." />
      ) : (
        <div className="panel overflow-hidden">
          {visibleRecommendations.map((recommendation, index) => {
            const habitation = habitations.find((item) => item.id === recommendation.habitationId);
            const destination = destinations.find((item) => item.id === recommendation.destinationId);
            if (!habitation || !destination) return null;
            return (
              <article key={recommendation.id} className={`border-b border-[var(--color-line)] px-4 py-5 transition-colors last:border-b-0 hover:bg-[var(--hover-soft)] ${recommendation.priority === "IMMEDIATE" ? "bg-[var(--row-accent)]" : ""} lg:px-5`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <span className="metric hidden w-7 shrink-0 text-[11px] text-[var(--color-fg-3)] xl:block">{String(index + 1).padStart(2, "0")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <span className="mono text-[10px] text-accent">{recommendation.id}</span>
                      <span className="text-[14px] font-semibold text-[var(--color-fg)]">{habitation.name}</span>
                      <PriorityBadge priority={recommendation.priority} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-fg-3)]">
                      <span>{habitation.id} · {fmtNum(habitation.population)} people · {habitation.hazard ?? "Hazard evidence unavailable"}</span>
                    </div>
                    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-fg-2)]">
                      {recommendation.reasons.slice(0, 3).map((reason) => (
                        <span key={reason} className="flex items-center gap-1.5">
                          <span className="h-[5px] w-[5px] rounded-full bg-safe" aria-hidden="true" />
                          {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-6">
                    <RiskScore score={habitation.riskScore} level={habitation.riskLevel} compact />
                    <div className="w-40">
                      <div className="eyebrow">Recommended</div>
                      <div className="mt-1 text-[13px] font-semibold text-[var(--color-fg)]">{entityCode(destination.name, destination.id)} · {destination.name}</div>
                      <div className={`mt-0.5 text-[10px] font-semibold tracking-[0.1em] ${recommendation.capacityStatus === "SUFFICIENT" ? "text-safe" : "text-immediate"}`}>
                        CAPACITY {recommendation.capacityStatus}
                      </div>
                    </div>
                    <Link href={`/recommendations/${recommendation.id}`} className="btn btn-outline btn-sm shrink-0">
                      Review <ArrowRight size={12} />
                    </Link>
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
