"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, Check, Play, RotateCcw, ShieldCheck, X } from "lucide-react";
import { API_MODE, approveRecommendation, getDestinationCapacity, getDestinations, getHabitation, getRecommendationById, getRecommendationFor } from "@/lib/api";
import { ApiError } from "@/types/api";
import type { CapacityCheck, Destination, Habitation, Recommendation } from "@/types/api";
import Modal from "@/components/ui/modal";
import OriginBadge from "@/components/ui/origin-badge";
import PriorityBadge from "@/components/ui/priority-badge";
import RiskScore from "@/components/ui/risk-score";
import Stat from "@/components/ui/stat";
import { entityCode, entityLabel, fmtNum } from "@/lib/format";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/ui/data-states";
import SpatialEvidencePanel from "@/components/ui/spatial-evidence-panel";
import { recordSessionDecision } from "@/lib/decision-log";

const DecisionMap = dynamic(() => import("@/components/recommendations/decision-map"), {
  ssr: false,
  loading: () => <div className="skeleton h-52" aria-label="Loading location context" />,
});

type ModalKind = "approve" | "override" | null;
type Result = { action: "approve" | "override"; destinationId: string; reason?: string };

export default function DecisionPage({ id }: { id: string }) {
  const [recommendation, setRecommendation] = useState<Recommendation>();
  const [habitation, setHabitation] = useState<Habitation>();
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [capacity, setCapacity] = useState<CapacityCheck>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();
  const [retry, setRetry] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [overrideStage, setOverrideStage] = useState<"review" | "confirm">("review");
  const [overrideDestination, setOverrideDestination] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [result, setResult] = useState<Result>();

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let rec: Recommendation;
        try {
          rec = await getRecommendationById(id);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            rec = await getRecommendationFor(id);
          } else {
            throw error;
          }
        }
        const hab = await getHabitation(rec.habitationId);
        const dests = await getDestinations();
        const cap = rec.destinationId ? await getDestinationCapacity(rec.destinationId).catch(() => undefined) : undefined;
        if (!active) return;
        setRecommendation(rec);
        setHabitation(hab);
        setDestinations(dests);
        setCapacity(cap);
        const fallback = dests.find((d) => d.eligible && d.id !== rec.destinationId) ?? dests.find((d) => d.eligible);
        setOverrideDestination(fallback?.id ?? "");
        setLoading(false);
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e : new Error("Load failed"));
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [id, retry]);

  const retryLoad = () => {
    setError(undefined);
    setLoading(true);
    setRetry((value) => value + 1);
  };

  const submit = async () => {
    if (!recommendation || !modal) return;
    if (!habitation) {
      setValidation("Habitation context is still loading — try again in a moment.");
      return;
    }
    if (modal === "override") {
      if (!overrideDestination) {
        setValidation("Select an alternative destination — the backend requires one.");
        return;
      }
      if (!reason.trim()) {
        setValidation("OVERRIDE REASON IS REQUIRED");
        return;
      }
      if (overrideStage === "review") {
        setOverrideStage("confirm");
        return;
      }
    }
    setValidation("");
    setSubmitError("");
    setSubmitting(true);
    try {
      const destinationId = modal === "approve" ? recommendation.destinationId : overrideDestination;
      if (!destinationId) {
        setValidation("No valid destination is available for this action.");
        setSubmitting(false);
        return;
      }
      await approveRecommendation(recommendation.wireId, {
        action: modal,
        destinationId,
        reason: reason.trim(),
        note: note.trim() || undefined,
      });
      // Persist the confirmed decision to session history so the
      // Officer Decision History panel shows it immediately.
      recordSessionDecision({
        id: `${recommendation.id}-${Date.now()}`,
        timestamp: new Date().toISOString(),
        habitationId: habitation.id,
        habitationName: habitation.name,
        recommendationId: recommendation.id,
        originalDestination: recommendation.destinationId ?? null,
        finalDestination: destinationId,
        action: modal,
        reason: reason.trim() || null,
        note: note.trim() || null,
        dataOrigin: recommendation.dataOrigin,
      });
      setResult({ action: modal, destinationId, reason: reason.trim() || undefined });
      setModal(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setSubmitError(
          e.kind === "auth"
            ? "Authentication failed (401). The configured officer identity was rejected by the backend."
            : e.kind === "validation"
              ? "Rejected (422). The selected destination likely fails the capacity gate."
              : e.kind === "unavailable"
                ? "Evidence unavailable (503). Capacity assessment could not be verified."
                : "Unable to record the officer decision. Please try again.",
        );
      } else {
        setSubmitError("Unable to record the officer decision. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <DashboardSkeleton />;
  if (error) return <ErrorState message="Unable to load officer decision data." onRetry={retryLoad} />;
  if (!recommendation || !habitation) return <EmptyState title="No recommendation found." />;
  const destination = destinations.find((item) => item.id === recommendation.destinationId);
  const selectedOverride = destinations.find((item) => item.id === overrideDestination);
  const eligibleOverrides = destinations.filter((item) => item.id !== recommendation.destinationId && item.eligible);
  const noEligible = recommendation.summary === "NO_ELIGIBLE_DESTINATION" || !recommendation.destinationId;

  const destinationLabel = (destId: string | null, fallback = "—"): string => {
    const match = destinations.find((item) => item.id === destId);
    return match ? entityLabel(match.name, match.id) : (destId ?? fallback);
  };
  const destinationCode = (destId: string | null, fallback = "—"): string => {
    const match = destinations.find((item) => item.id === destId);
    return match ? entityCode(match.name, match.id) : (destId ?? fallback);
  };

  /* ---------------- SUCCESS STATE ---------------- */
  if (result) {
    return (
      <div className="fade-up mx-auto max-w-xl">
        <div className="panel p-8 text-center">
          <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${result.action === "approve" ? "border-safe/30 bg-safe/10 text-safe" : "border-medium/30 bg-medium/10 text-medium"}`}>
            <Check size={24} aria-hidden="true" />
          </span>
          <div className={`eyebrow mt-5 ${result.action === "approve" ? "text-safe" : "text-medium"}`}>
            RECOMMENDATION {result.action === "approve" ? "APPROVED" : "OVERRIDDEN"}
          </div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Officer decision recorded.</h1>
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-line)] text-left sm:grid-cols-3">
            {[
              ["HABITATION", entityCode(habitation.name, habitation.id)],
              [result.action === "approve" ? "DESTINATION" : "OFFICER SELECTED", destinationLabel(result.destinationId)],
              ["PRIORITY", recommendation.priority ?? "PENDING"],
            ].map(([label, value]) => (
              <div key={label} className="bg-surface p-4">
                <Stat label={label} value={value} />
              </div>
            ))}
          </div>
          {result.reason && <p className="mt-4 text-[12px] italic leading-5 text-[var(--color-fg-2)]">“{result.reason}”</p>}
          <p className="mt-5 border-t border-[var(--color-line)] pt-4 text-[12px] leading-5 text-[var(--color-fg-3)]">
            {API_MODE === "MOCK"
              ? "Demo behavior — in live operation this decision is written to the append-only approval audit. The original recommendation is preserved unchanged."
              : "Recorded to the append-only approval audit. The original recommendation is preserved unchanged."}
          </p>
          <p className="mt-3 text-[12px] leading-5 text-[var(--color-fg-2)]">
            This records the officer&apos;s decision. It does not mean relocation has been executed.
          </p>
          <Link href="/recommendations" className="btn btn-primary mt-5">
            Back to recommendations <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  const chain = [
    { label: "HABITATION", value: entityCode(habitation.name, habitation.id) },
    { label: "RISK", value: `${habitation.riskScore ?? "—"}${habitation.riskLevel ? ` / 100 · ${habitation.riskLevel}` : ""}` },
    { label: "PRIORITY", value: recommendation.priority ?? "UNAVAILABLE" },
    { label: "POPULATION", value: fmtNum(habitation.population) },
    { label: "DESTINATION", value: destinationCode(recommendation.destinationId, "UNAVAILABLE") },
    { label: "CAPACITY", value: recommendation.capacityStatus },
    { label: "OFFICER DECISION", value: "PENDING" },
  ];

  return (
    <div className="fade-up">
      {/* ============ 1. PAGE HEADER ============ */}
      <div className="mb-6">
        <Link href={`/recommendations/${recommendation.id}`} className="text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]">
          ← BACK TO RECOMMENDATION
        </Link>
        <div className="mt-3.5 flex flex-wrap items-center gap-3">
          <div className="eyebrow text-accent">OFFICER DECISION</div>
          <OriginBadge origin={recommendation.dataOrigin} />
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">
          Review the relocation recommendation and record the final operational decision.
        </h1>
        <div className="mono mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] tracking-[0.08em] text-[var(--color-fg-3)]">
          <span>CASE ID · {entityCode(habitation.name, habitation.id)}</span>
          <span>RECOMMENDATION ID · {recommendation.id.replace(/^REC-/, "")}</span>
          <span>HAB {habitation.id} · REC #{recommendation.wireId}</span>
        </div>
      </div>

      {/* ============ 3. CASE CONTEXT HERO ============ */}
      <section className="panel glow-top mb-4 overflow-hidden border-accent/25" aria-label="Case context">
        <div className="grid grid-cols-2 gap-px bg-[var(--color-line)] sm:grid-cols-4">
          <div className="bg-surface p-4">
            <div className="eyebrow">HABITATION</div>
            <div className="metric mt-1.5 text-2xl font-semibold text-[var(--color-fg)]">{entityCode(habitation.name, habitation.id)}</div>
            <div className="mt-1 truncate text-[11px] text-[var(--color-fg-3)]">{habitation.name}</div>
          </div>
          <div className="bg-surface p-4">
            <div className="eyebrow">RISK</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="hero-stat text-2xl">{habitation.riskScore ?? "—"}</span>
              <span className="metric text-[11px] text-[var(--color-fg-3)]">/ 100</span>
            </div>
            <div className={`mt-1 font-display text-[11px] font-semibold tracking-[0.1em] ${habitation.riskLevel === "HIGH" ? "text-immediate" : habitation.riskLevel === "MEDIUM" ? "text-short" : habitation.riskLevel ? "text-safe" : "text-[var(--color-fg-3)]"}`}>{habitation.riskLevel ?? "UNAVAILABLE"}</div>
          </div>
          <div className="bg-surface p-4">
            <div className="eyebrow">PRIORITY</div>
            <div className="mt-2"><PriorityBadge priority={recommendation.priority} /></div>
          </div>
          <div className="bg-surface p-4">
            <div className="eyebrow">POPULATION</div>
            <div className="metric mt-1.5 text-2xl font-semibold text-[var(--color-fg)]">{fmtNum(habitation.population)}</div>
            <div className="mt-1 text-[11px] text-[var(--color-fg-3)]">people affected</div>
          </div>
        </div>
      </section>

      {/* ============ 4. DECISION FLOW ============ */}
      <section className="panel mb-4 overflow-hidden" aria-label="Decision chain: habitation through risk, priority, population, destination, capacity, to officer decision">
        <div className="flex items-stretch gap-x-1 gap-y-3 overflow-x-auto px-5 py-4">
          {chain.map((step, index) => (
            <div key={step.label} className="flex items-center">
              {index > 0 && <span className="mx-2 shrink-0 text-[var(--color-fg-3)]" aria-hidden="true">↓</span>}
              <div className="min-w-[86px] shrink-0">
                <div className={`font-display text-[9px] font-semibold tracking-[0.14em] ${index === chain.length - 1 ? "text-accent" : "text-[var(--color-fg-3)]"}`}>{step.label}</div>
                <div className={`mono mt-1 text-[12px] font-semibold ${index === chain.length - 1 ? "text-accent" : "text-[var(--color-fg)]"}`}>{step.value}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_.85fr]">
        {/* ============ LEFT COLUMN ============ */}
        <div className="space-y-4">
          {/* 5. RECOMMENDATION UNDER REVIEW */}
          <section className={`panel glow-top overflow-hidden ${noEligible ? "border-immediate/30" : "border-accent/30"}`} aria-label="Recommendation under review">
            <div className="border-b border-[var(--color-line)] px-5 py-3.5">
              <div className="eyebrow">RECOMMENDATION UNDER REVIEW</div>
            </div>
            <div className="bg-surface p-5">
              <div className="eyebrow text-[var(--color-fg-3)]">RELOCATE TO</div>
              {destination ? (
                <>
                  <div className="mt-2 flex flex-wrap items-baseline gap-3">
                    <span className="metric text-4xl font-semibold text-accent">{entityCode(destination.name, destination.id)}</span>
                    <span className="font-display text-lg font-semibold text-[var(--color-fg)]">{destination.name.replace(/^\s*[HD]\d{2,}\s*·\s*/, "") || destination.name}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--color-line)] pt-4">
                    <div>
                      <div className="eyebrow">CAPACITY</div>
                      <div className={`mt-1 font-display text-[13px] font-semibold tracking-[0.08em] ${recommendation.capacityStatus === "SUFFICIENT" ? "text-safe" : "text-immediate"}`}>
                        {recommendation.capacityStatus === "SUFFICIENT" ? "✓ SUFFICIENT" : recommendation.capacityStatus}
                      </div>
                    </div>
                    <div>
                      <div className="eyebrow">STATUS</div>
                      <div className="mt-1.5 font-display text-[13px] font-semibold text-[var(--color-fg)]">{destination.status}</div>
                    </div>
                    <div className="ml-auto">
                      <div className="eyebrow">CONFIDENCE</div>
                      <div className="metric mt-1 text-[13px] font-semibold text-[var(--color-fg)]">
                        {recommendation.confidence !== null ? `${Math.round(recommendation.confidence * 100)}%` : "UNAVAILABLE"}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="mt-2">
                  <div className="font-display text-2xl font-semibold text-immediate">NO ELIGIBLE DESTINATION</div>
                  <p className="mt-2 max-w-md text-[13px] leading-6 text-[var(--color-fg-2)]">
                    No destination passed the capacity eligibility gate. Approval is unavailable — an override with a
                    valid destination (or new capacity evidence) is required.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* 6. WHY THIS RECOMMENDATION */}
          <section className="panel p-5" aria-label="Why AVASYA recommends this">
            <div className="flex items-center gap-2.5">
              <ShieldCheck size={16} className="text-accent" aria-hidden="true" />
              <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">WHY AVASYA RECOMMENDS THIS</h2>
            </div>
            <ol className="mt-4 space-y-3">
              {recommendation.reasons.map((item, index) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="metric mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] border border-accent/30 bg-accent/10 text-[10px] font-semibold text-accent">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[13px] leading-6 text-[var(--color-fg-2)]">{item}</span>
                </li>
              ))}
              {recommendation.reasons.length === 0 && (
                <li className="text-[13px] text-[var(--color-fg-3)]">The backend did not supply structured reasons for this recommendation.</li>
              )}
            </ol>
          </section>

          {/* 7. ALTERNATIVES REVIEWED */}
          <section className="panel p-5" aria-label="Alternatives reviewed">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-fg)]">ALTERNATIVES REVIEWED</h2>
            <p className="mt-1.5 text-[12px] text-[var(--color-fg-3)]">Destinations that did not pass the capacity eligibility gate, with the gate&apos;s stated reason.</p>
            <div className="mt-4 space-y-2.5">
              {recommendation.whyNot.length > 0 ? (
                recommendation.whyNot.map((item) => (
                  <div key={item.destination} className="flex gap-3 rounded-[5px] border border-[var(--color-line)] p-3.5">
                    <X size={15} className="mt-0.5 shrink-0 text-immediate" aria-hidden="true" />
                    <div>
                      <div className="text-[13px] font-semibold text-[var(--color-fg)]">
                        {item.destination} <span className="ml-1.5 font-display text-[9px] font-semibold tracking-[0.14em] text-immediate">NOT PREFERRED</span>
                      </div>
                      <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-2)]">{item.reason}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-[var(--color-fg-3)]">No alternative destinations were assessed for this recommendation.</p>
              )}
            </div>
          </section>

          {/* 10. GIS / LOCATION CONTEXT */}
          <section className="panel overflow-hidden" aria-label="Location context">
            <div className="border-b border-[var(--color-line)] px-5 py-3.5">
              <div className="eyebrow">LOCATION CONTEXT</div>
              <h2 className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">Source and destination</h2>
            </div>
            <DecisionMap
              source={habitation.coordinates}
              destination={destination?.coordinates ?? null}
              sourceLabel={entityCode(habitation.name, habitation.id)}
              destinationLabel={destinationCode(recommendation.destinationId)}
            />
          </section>
        </div>

        {/* ============ RIGHT COLUMN ============ */}
        <div className="space-y-4">
          {/* 2. DECISION STATUS */}
          <section className="panel p-5" aria-label="Decision status">
            <div className="eyebrow">DECISION STATUS</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="dot" style={{ background: "var(--color-medium)" }} aria-hidden="true" />
              <span className="text-[13px] font-semibold text-medium">PENDING REVIEW</span>
            </div>
            <p className="mt-2 text-[11px] leading-5 text-[var(--color-fg-3)]">
              Approval posts to <span className="mono">POST /api/v1/recommendations/{recommendation.wireId}/approval</span> — the response is an append-only audit record.
            </p>
          </section>

          {/* 8. CAPACITY VERIFICATION */}
          <section className="panel p-5" aria-label="Capacity verification">
            <div className="flex items-center justify-between">
              <div className="eyebrow">CAPACITY VERIFICATION</div>
              <Link href={`/destinations/${recommendation.destinationId ?? ""}/capacity`} className="text-[10px] font-semibold tracking-[0.08em] text-accent transition-colors hover:text-[var(--color-fg)]">
                VIEW FULL CAPACITY →
              </Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ["DESTINATION", destinationCode(recommendation.destinationId)],
                ["NOMINAL CAPACITY", fmtNum(capacity?.nominalCapacity ?? destination?.nominalCapacity ?? null)],
                ["OCCUPANCY", fmtNum(capacity?.currentOccupancy ?? destination?.currentOccupancy ?? null)],
                ["USABLE CAPACITY", fmtNum(capacity?.usableCapacity ?? destination?.usableCapacity ?? null)],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="eyebrow">{label}</div>
                  <div className="metric mt-1 text-[15px] font-semibold text-[var(--color-fg)]">{value}</div>
                </div>
              ))}
            </div>
            <div className={`mt-3.5 rounded-[4px] border px-3 py-2 font-display text-[11px] font-semibold tracking-[0.1em] ${recommendation.capacityStatus === "SUFFICIENT" ? "border-safe/30 bg-safe/10 text-safe" : "border-immediate/30 bg-immediate/10 text-immediate"}`}>
              {recommendation.capacityStatus === "SUFFICIENT" ? "✓ CAPACITY SUFFICIENT" : `CAPACITY ${recommendation.capacityStatus}`}
            </div>
          </section>

          {/* 9. RISK VERIFICATION */}
          <section className="panel p-5" aria-label="Risk verification">
            <div className="flex items-center justify-between">
              <div className="eyebrow">RISK VERIFICATION</div>
              <Link href={`/habitations/${habitation.id}`} className="text-[10px] font-semibold tracking-[0.08em] text-accent transition-colors hover:text-[var(--color-fg)]">
                VIEW RISK ANALYSIS →
              </Link>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <div className="eyebrow">RISK SCORE</div>
                <div className="mt-1"><RiskScore score={habitation.riskScore} level={habitation.riskLevel} compact /></div>
              </div>
              <div className="text-right">
                <div className="eyebrow">PRIORITY</div>
                <div className="mt-1.5"><PriorityBadge priority={recommendation.priority} /></div>
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-1.5 border-t border-[var(--color-line)] pt-3 text-[11px]">
              <Link href={`/habitations/${habitation.id}`} className="text-[10px] font-semibold tracking-[0.08em] text-accent transition-colors hover:text-[var(--color-fg)]">VIEW HABITATION →</Link>
              <Link href="/destinations/compare" className="text-[10px] font-semibold tracking-[0.08em] text-accent transition-colors hover:text-[var(--color-fg)]">VIEW COMPARISON →</Link>
            </div>
          </section>

          {/* 13–15. SCENARIO CHECK (WHAT-IF) */}
          {destination && <ScenarioCheck destination={destination} alternative={eligibleOverrides[0]} capacityStatus={recommendation.capacityStatus} />}

          {/* 11–12. DATA & EVIDENCE */}
          <SpatialEvidencePanel habitation={habitation} />

          {/* 16. DECISION ZONE */}
          <section className="panel border-accent/40 bg-accent/[0.04] p-5 shadow-[0_0_0_1px_var(--color-line)]" aria-label="Officer decision zone">
            <div className="eyebrow text-accent">OFFICER DECISION</div>
            <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">AVASYA provides a recommendation. Final action remains with the authorized officer.</p>
            {destination && (
              <div className="mt-4 rounded-[5px] border border-accent/25 bg-[var(--panel-wash)] px-4 py-3">
                <div className="eyebrow text-[var(--color-fg-3)]">RECOMMENDED ACTION</div>
                <div className="mt-1 font-display text-[15px] font-semibold text-[var(--color-fg)]">
                  RELOCATE TO <span className="metric text-accent">{entityCode(destination.name, destination.id)}</span>
                </div>
              </div>
            )}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => setModal("approve")}
                disabled={submitting || !destination}
                title={destination ? undefined : "Unavailable — capacity gate rejected all destinations"}
                className="btn btn-primary w-full py-3.5 text-[13px] tracking-[0.06em]"
              >
                APPROVE RECOMMENDATION
              </button>
              <button
                onClick={() => setModal("override")}
                disabled={submitting || eligibleOverrides.length === 0}
                title={eligibleOverrides.length === 0 ? "No alternative destination currently passes the capacity eligibility gate" : undefined}
                aria-describedby={eligibleOverrides.length === 0 ? "override-disabled-reason" : undefined}
                className="btn btn-outline w-full py-3"
              >
                OVERRIDE
              </button>
              {eligibleOverrides.length === 0 && (
                <p id="override-disabled-reason" className="mt-1.5 text-center text-[10px] leading-4 tracking-[0.06em] text-[var(--color-fg-3)]">
                  NO ALTERNATIVE PASSES THE CAPACITY GATE — OVERRIDE UNAVAILABLE
                </p>
              )}
            </div>
            <p className="mt-4 border-t border-accent/20 pt-4 text-center font-display text-[10px] font-semibold tracking-[0.14em] text-accent">
              AVASYA RECOMMENDS. THE HUMAN DECIDES.
            </p>
          </section>
        </div>
      </div>

      {/* 18. APPROVE CONFIRMATION MODAL */}
      {modal === "approve" && (
        <Modal title="APPROVE RELOCATION RECOMMENDATION?" onClose={() => !submitting && setModal(null)}>
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
            {[
              ["HABITATION", entityCode(habitation.name, habitation.id)],
              ["PRIORITY", recommendation.priority ?? "PENDING"],
              ["POPULATION", fmtNum(habitation.population)],
              ["DESTINATION", destinationLabel(recommendation.destinationId)],
              ["CAPACITY", recommendation.capacityStatus],
            ].map(([label, value]) => (
              <div key={label} className="bg-raised p-3.5">
                <Stat label={label} value={value} />
              </div>
            ))}
          </div>
          <p className="mt-4 text-[13px] leading-6 text-[var(--color-fg-2)]">
            This action records the officer&apos;s decision for <span className="font-semibold text-[var(--color-fg)]">{habitation.name}</span> ({fmtNum(habitation.population)} people).
            It does not automatically execute relocation.
          </p>
          {submitError && (
            <div role="alert" className="mt-3 rounded-[4px] border border-immediate/30 bg-immediate/10 px-3 py-2.5">
              <div className="font-display text-[10px] font-semibold tracking-[0.12em] text-immediate">APPROVAL FAILED</div>
              <p className="mt-1 text-[11px] leading-4 text-[var(--color-fg-2)]">{submitError}</p>
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
            <button onClick={() => setModal(null)} disabled={submitting} className="btn btn-outline">
              Cancel
            </button>
            <button onClick={submit} disabled={submitting} className="btn btn-primary">
              {submitting ? "APPROVING…" : "APPROVE RECOMMENDATION"}
            </button>
          </div>
        </Modal>
      )}

      {/* 21–24. OVERRIDE MODAL */}
      {modal === "override" && (
        <Modal title="OVERRIDE RECOMMENDATION" onClose={() => !submitting && (setModal(null), setOverrideStage("review"))}>
          {overrideStage === "review" ? (
            <>
              <p className="mt-4 text-[13px] leading-6 text-[var(--color-fg-2)]">
                Override rejects the recommendation in favor of another destination. The backend re-checks the capacity
                gate and records the officer identity from the authenticated user.
              </p>
              <div className="mt-5 space-y-4">
                <label className="eyebrow block">
                  ALTERNATIVE DESTINATION · ELIGIBLE ONLY
                  <select
                    value={overrideDestination}
                    onChange={(event) => setOverrideDestination(event.target.value)}
                    className="field mt-2 font-sans text-[13px] normal-case tracking-normal"
                  >
                    <option value="">Select a destination</option>
                    {destinations
                      .filter((item) => item.id !== recommendation.destinationId)
                      .map((item) => (
                        <option key={item.id} value={item.id} disabled={!item.eligible}>
                          {entityLabel(item.name, item.id)}{item.eligible ? "" : " · FAILS CAPACITY GATE"}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="eyebrow block">
                  REASON · REQUIRED
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Officer's documented justification for the override"
                    className="field mt-2 min-h-20 font-sans text-[13px] normal-case tracking-normal"
                  />
                </label>
                {validation && (
                  <p role="alert" className="text-[11px] font-semibold text-immediate">{validation}</p>
                )}
                <label className="eyebrow block">
                  NOTES · <span className="normal-case tracking-normal text-[var(--color-fg-3)]">optional</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional note"
                    className="field mt-2 min-h-16 font-sans text-[13px] normal-case tracking-normal"
                  />
                </label>
                {selectedOverride && (
                  <div className="flex items-center justify-between rounded-[5px] border border-[var(--color-line)] bg-raised px-3.5 py-3 text-[12px]">
                    <span className="text-[var(--color-fg-2)]">
                      System recommendation <span className="metric font-semibold text-[var(--color-fg-3)]">{destinationCode(recommendation.destinationId)}</span>
                    </span>
                    <ArrowRight size={13} className="text-[var(--color-fg-3)]" aria-hidden="true" />
                    <span className="text-[var(--color-fg)]">
                      Officer override <span className="metric font-semibold text-accent">{entityCode(selectedOverride.name, selectedOverride.id)}</span>
                    </span>
                  </div>
                )}
              </div>
              {submitError && (
                <div role="alert" className="mt-3 rounded-[4px] border border-immediate/30 bg-immediate/10 px-3 py-2.5">
                  <div className="font-display text-[10px] font-semibold tracking-[0.12em] text-immediate">OVERRIDE FAILED</div>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-fg-2)]">{submitError}</p>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
                <button onClick={() => setModal(null)} disabled={submitting} className="btn btn-outline">
                  Cancel
                </button>
                <button onClick={submit} disabled={submitting} className="btn btn-primary">
                  Review override
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-px overflow-hidden rounded-[5px] border border-[var(--color-line)] bg-[var(--color-line)]">
                {[
                  ["DESTINATION", destinationLabel(overrideDestination)],
                  ["REASON", reason.trim()],
                ].map(([label, value]) => (
                  <div key={label} className="bg-raised px-4 py-3">
                    <div className="eyebrow">{label}</div>
                    <div className={`mt-1 text-[13px] ${label === "REASON" ? "italic leading-5 text-[var(--color-fg-2)]" : "font-semibold text-[var(--color-fg)]"}`}>{value}</div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[12px] leading-5 text-[var(--color-fg-2)]">
                Confirming records the override to the decision audit. The original recommendation is preserved unchanged.
              </p>
              {submitError && (
                <div role="alert" className="mt-3 rounded-[4px] border border-immediate/30 bg-immediate/10 px-3 py-2.5">
                  <div className="font-display text-[10px] font-semibold tracking-[0.12em] text-immediate">OVERRIDE FAILED</div>
                  <p className="mt-1 text-[11px] leading-4 text-[var(--color-fg-2)]">{submitError}</p>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2 border-t border-[var(--color-line)] pt-4">
                <button onClick={() => setOverrideStage("review")} disabled={submitting} className="btn btn-outline">
                  Cancel
                </button>
                <button onClick={submit} disabled={submitting} className="btn btn-primary">
                  {submitting ? "RECORDING DECISION…" : "CONFIRM OVERRIDE"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

/* ============ 13–15. SCENARIO CHECK ============ */
function ScenarioCheck({
  destination,
  alternative,
  capacityStatus,
}: {
  destination: Destination;
  alternative?: Destination;
  capacityStatus: Recommendation["capacityStatus"];
}) {
  const [unavailable, setUnavailable] = useState(false);
  const originalCode = entityCode(destination.name, destination.id);
  return (
    <section className="panel border-medium/25 p-5" aria-label="Scenario check — what-if simulation">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-medium" aria-hidden="true" />
        <div className="eyebrow text-medium">SCENARIO CHECK</div>
        <span className="ml-auto rounded-[3px] border border-medium/40 bg-medium/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.14em] text-medium">SIMULATION</span>
      </div>
      <h2 className="mt-2.5 font-display text-[15px] font-semibold text-[var(--color-fg)]">What if the recommended destination becomes unavailable?</h2>
      {!unavailable ? (
        <>
          <div className="mt-3 flex items-center justify-between rounded-[5px] border border-[var(--color-line)] bg-raised px-3.5 py-3">
            <div>
              <div className="eyebrow">CURRENT</div>
              <div className="metric mt-1 text-[15px] font-semibold text-[var(--color-fg)]">{originalCode} <span className="font-display text-[9px] font-semibold tracking-[0.12em] text-accent">RECOMMENDED</span></div>
            </div>
            <button onClick={() => setUnavailable(true)} className="btn btn-outline btn-sm border-medium/40 text-medium hover:border-medium/60 hover:text-[var(--color-fg)]">
              SIMULATE UNAVAILABLE <Play size={11} aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-2)]">
            Preview the recalculated fallback if {originalCode} is lost. Nothing operational changes.
          </p>
        </>
      ) : alternative ? (
        <>
          <div className="mt-3.5 space-y-2.5 rounded-[5px] border border-[var(--color-line)] bg-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">CURRENT RECOMMENDATION</span>
              <span className="metric text-[13px] font-semibold text-[var(--color-fg-3)] line-through decoration-immediate/70">{originalCode}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-medium">
              <span aria-hidden="true">↓</span> SCENARIO · {originalCode} UNAVAILABLE
            </div>
            <div className="flex items-center justify-between">
              <span className="eyebrow">ALTERNATIVE</span>
              <span className="metric text-[15px] font-semibold text-accent">{entityCode(alternative.name, alternative.id)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-2.5">
              <span className="eyebrow">CAPACITY</span>
              <span className={`font-display text-[11px] font-semibold tracking-[0.1em] ${capacityStatus === "SUFFICIENT" ? "text-safe" : "text-immediate"}`}>{capacityStatus}</span>
            </div>
            <div>
              <span className="eyebrow">REASON</span>
              <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-2)]">Next-best eligible destination if the recommendation is unavailable.</p>
            </div>
          </div>
          <Link href={`/destinations/${alternative.id}/capacity`} className="btn btn-primary btn-sm mt-3.5 w-full">
            View alternative capacity <ArrowRight size={11} />
          </Link>
        </>
      ) : (
        <>
          <div className="mt-3.5 rounded-[5px] border border-[var(--color-line)] bg-raised p-3.5">
            <div className="flex items-center justify-between">
              <span className="eyebrow">CURRENT RECOMMENDATION</span>
              <span className="metric text-[13px] font-semibold text-[var(--color-fg-3)] line-through decoration-immediate/70">{originalCode}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold tracking-[0.1em] text-medium">
              <span aria-hidden="true">↓</span> SCENARIO · {originalCode} UNAVAILABLE
            </div>
            <p className="mt-2.5 text-[12px] leading-5 text-[var(--color-fg-2)]">
              No alternative eligible destination exists in the current candidate set.
            </p>
          </div>
        </>
      )}
      {unavailable && (
        <button onClick={() => setUnavailable(false)} className="btn btn-outline btn-sm mt-3">
          <RotateCcw size={12} aria-hidden="true" /> RESTORE ORIGINAL
        </button>
      )}
      <p className="mt-3.5 border-t border-[var(--color-line)] pt-3 text-[10px] leading-4 tracking-wide text-[var(--color-fg-3)]">
        SIMULATION ONLY — NO OPERATIONAL DECISION HAS BEEN CHANGED.
      </p>
    </section>
  );
}
