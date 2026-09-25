"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, RotateCcw, Search, SlidersHorizontal } from "lucide-react";
import { getHabitations } from "@/lib/api";
import type { Habitation, Priority, RiskLevel } from "@/types/api";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import PageHead from "@/components/layout/page-head";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import { entityCode, fmtNum, fmtText } from "@/lib/format";
import DataProvenanceBadge from "@/components/ui/data-provenance-badge";

export default function HabitationsPage() {
  const [data, setData] = useState<Habitation[]>([]);
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<Priority | "ALL">("ALL");
  const [risk, setRisk] = useState<RiskLevel | "ALL">("ALL");
  const [hazard, setHazard] = useState("ALL");
  const [district, setDistrict] = useState("ALL");
  const [state, setState] = useState("ALL");
  const [evidence, setEvidence] = useState<"ALL" | "AVAILABLE" | "PARTIAL">("ALL");
  const [sort, setSort] = useState<"risk" | "population">("risk");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    getHabitations()
      .then((items) => {
        if (active) {
          setData(items);
          setLoading(false);
        }
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
  const hazards = Array.from(new Set(data.map((item) => item.hazard)));
  const filtered = useMemo(
    () =>
      data
        .filter(
          (item) =>
            `${item.id} ${item.name} ${item.hazard ?? ""} ${item.district ?? ""} ${item.state ?? ""}`.toLowerCase().includes(query.toLowerCase()) &&
            (priority === "ALL" || item.priority === priority) &&
            (risk === "ALL" || item.riskLevel === risk) &&
            (hazard === "ALL" || item.hazard === hazard) &&
            (district === "ALL" || item.district === district) &&
            (state === "ALL" || item.state === state) &&
            (evidence === "ALL" || (evidence === "AVAILABLE" ? item.riskScore !== null : item.warnings.length > 0)),
        )
        .sort((a, b) => (sort === "risk" ? (b.riskScore ?? -1) - (a.riskScore ?? -1) : (b.population ?? 0) - (a.population ?? 0))),
    [data, district, evidence, hazard, priority, query, risk, sort, state],
  );
  const districts = Array.from(new Set(data.map((item) => item.district).filter((value): value is string => Boolean(value))));
  const states = Array.from(new Set(data.map((item) => item.state).filter((value): value is string => Boolean(value))));
  const activeFilters = [query, priority, risk, hazard, district, state, evidence].some((value) => value !== "" && value !== "ALL");
  const summary = {
    total: data.length,
    immediate: data.filter((item) => item.priority === "IMMEDIATE").length,
    high: data.filter((item) => item.riskLevel === "HIGH").length,
    population: data.filter((item) => item.riskLevel !== "LOW").reduce((total, item) => total + (item.population ?? 0), 0),
  };
  const retryLoad = () => {
    setError(false);
    setLoading(true);
    setRetry((value) => value + 1);
  };
  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load habitation data." onRetry={retryLoad} />;
  return (
    <div className="fade-up">
      <PageHead eyebrow="FIELD INTELLIGENCE" title="Habitation intelligence" description="Monitor exposed populations, risk severity, relocation priority, and available evidence.">
        <Link href="/hazard-map" className="btn btn-outline btn-sm">
          Open risk map
        </Link>
      </PageHead>

      <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] lg:grid-cols-5">
        {[
          ["TOTAL HABITATIONS", summary.total.toLocaleString(), "text-[var(--color-fg)]"],
          ["IMMEDIATE", summary.immediate.toLocaleString(), "text-immediate"],
          ["HIGH RISK", summary.high.toLocaleString(), "text-short"],
          ["POPULATION AT RISK", summary.population.toLocaleString(), "text-accent"],
          // Coverage criterion: a PERSISTED RISK ASSESSMENT exists for the
          // habitation (riskScore comes from the backend's decision queue).
          // The old factors.length test could never pass on list data (the
          // queue endpoint omits contributions), which permanently showed a
          // false UNAVAILABLE even when every habitation was assessed.
          ["EVIDENCE COVERAGE", data.every((item) => item.riskScore !== null) ? "AVAILABLE" : data.some((item) => item.riskScore !== null) ? "PARTIAL" : "UNAVAILABLE", "text-[var(--color-fg-2)]"],
        ].map(([label, value, tone]) => (
          <div key={label} className="bg-surface p-4">
            <div className="eyebrow">{label}</div>
            <div className={`metric mt-2.5 text-2xl font-semibold leading-none ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="panel mb-4 flex flex-col gap-2.5 p-2.5">
        <label className="field flex flex-1 items-center gap-2.5">
          <Search size={15} className="shrink-0 text-[var(--color-fg-3)]" aria-hidden="true" />
          <span className="sr-only">Search habitations</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search habitation, ID, district, or hazard" className="w-full bg-transparent outline-none placeholder:text-[var(--color-fg-3)]" />
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
          <select aria-label="District filter" value={district} onChange={(event) => setDistrict(event.target.value)} className="field w-auto py-2 text-xs"><option value="ALL">All districts</option>{districts.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="State filter" value={state} onChange={(event) => setState(event.target.value)} className="field w-auto py-2 text-xs"><option value="ALL">All states</option>{states.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Evidence filter" value={evidence} onChange={(event) => setEvidence(event.target.value as "ALL" | "AVAILABLE" | "PARTIAL")} className="field w-auto py-2 text-xs"><option value="ALL">All evidence</option><option value="AVAILABLE">Evidence available</option><option value="PARTIAL">Partial evidence</option></select>
          <select aria-label="Sort habitations" value={sort} onChange={(event) => setSort(event.target.value as "risk" | "population")} className="field w-auto py-2 text-xs">
            <option value="risk">Sort by risk</option>
            <option value="population">Sort by population</option>
          </select>
        </div>
        {activeFilters && <button type="button" onClick={() => { setQuery(""); setPriority("ALL"); setRisk("ALL"); setHazard("ALL"); setDistrict("ALL"); setState("ALL"); setEvidence("ALL"); }} className="btn btn-ghost btn-sm self-start xl:self-center"><RotateCcw size={12} /> Clear filters</button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No habitations match the selected filters." description="Try clearing a filter or changing the search term." />
      ) : (
        <>
          {/* Desktop: Swiss table */}
          <div className="panel hidden overflow-x-auto md:block">
              <table className="data-table min-w-[1120px]">
              <thead>
                <tr>
                    {["Status", "Habitation", "Location", "Population", "Hazard", "Risk", "Priority", "Evidence", ""].map((item) => (
                    <th key={item}>{item}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="group">
                    <td>
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td>
                      <div className="flex items-center gap-3"><span className="tick shrink-0" style={{ width: 3, height: 24, background: item.priority === "IMMEDIATE" ? "var(--color-immediate)" : item.priority === "SHORT-TERM" ? "var(--color-short)" : item.riskLevel === "LOW" ? "var(--color-safe)" : "var(--color-medium)" }} aria-hidden="true" /><span><Link href={`/habitations/${item.id}`} className="font-medium text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-fg)]">{item.name}</Link><span className="mono mt-0.5 block text-[10px] text-[var(--color-fg-3)]">{entityCode(item.name, item.id)}</span></span></div>
                    </td>
                    <td><div className="text-[11px] text-[var(--color-fg-2)]">{item.district ?? "District unavailable"}</div><div className="mt-0.5 text-[10px] text-[var(--color-fg-3)]">{item.state ?? "State unavailable"}</div>{item.coordinates && <div className="mono mt-1 text-[9px] text-[var(--color-fg-3)]">{item.coordinates[0].toFixed(3)}, {item.coordinates[1].toFixed(3)}</div>}</td>
                    <td className="metric text-[var(--color-fg-2)]">{fmtNum(item.population)}</td>
                    <td className="text-[var(--color-fg-2)]">{item.hazard ?? "Evidence unavailable"}</td>
                    <td>
                      <RiskScore score={item.riskScore} level={item.riskLevel} compact />
                    </td>
                    <td>
                      <PriorityBadge priority={item.priority} />
                    </td>
                    <td><div className="flex flex-col gap-1"><DataProvenanceBadge provenance={item.riskScore !== null ? item.dataOrigin : "UNAVAILABLE"} /><span className="text-[9px] font-semibold tracking-[0.1em] text-[var(--color-fg-3)]">{item.riskScore !== null ? (item.warnings.length ? "PARTIAL EVIDENCE" : "EVIDENCE AVAILABLE") : "EVIDENCE UNAVAILABLE"}</span></div></td>
                    <td className="text-right">
                      <Link href={`/habitations/${item.id}`} className="inline-flex items-center gap-1 text-[11px] font-semibold text-accent transition-colors hover:text-[var(--color-fg)]" aria-label={`Open ${item.name} details`}>
                        VIEW DOSSIER <ArrowRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: stacked cards */}
          <div className="grid gap-3 md:hidden">
            {filtered.map((item) => (
              <Link key={item.id} href={`/habitations/${item.id}`} className="panel hover-lift block p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="mono text-[10px] text-[var(--color-fg-3)]">{entityCode(item.name, item.id)}</span>
                    <div className="mt-1 text-[14px] font-semibold text-[var(--color-fg)]">{item.name}</div>
                  </div>
                  <RiskScore score={item.riskScore} level={item.riskLevel} compact />
                </div>
                <div className="mt-3.5 flex items-center justify-between border-t border-[var(--color-line)] pt-3">
                  <span className="text-[11px] text-[var(--color-fg-3)]">{fmtNum(item.population)} people · {fmtText(item.hazard)}</span>
                  <PriorityBadge priority={item.priority} />
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-[var(--color-line)] pt-3"><DataProvenanceBadge provenance={item.dataOrigin} /><span className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-[0.1em] text-accent">VIEW DOSSIER <ArrowRight size={11} /></span></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
