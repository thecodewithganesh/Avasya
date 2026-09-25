import { CheckCircle2, CircleDashed, HelpCircle, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Destination, Recommendation } from "@/types/api";

/**
 * Relocation feasibility, derived ONLY from persisted contract fields:
 * capacity gate (usable vs required), destination hazard exposure, road
 * access, and whether any of those exist at all. No route geometry, travel
 * time, or distance exist in the current contract — those never contribute
 * here and are never simulated.
 */

export type FeasibilityStatus = "FEASIBLE" | "CAPACITY LIMITED" | "ROUTE RISK" | "INSUFFICIENT DATA" | "NOT FEASIBLE";

const config: Record<FeasibilityStatus, { icon: typeof CheckCircle2; className: string; note: string }> = {
  FEASIBLE: { icon: CheckCircle2, className: "text-safe", note: "Capacity gate passed with available evidence." },
  "CAPACITY LIMITED": { icon: TriangleAlert, className: "text-short", note: "Usable capacity does not cover the relocation requirement." },
  "ROUTE RISK": { icon: ShieldAlert, className: "text-immediate", note: "Destination hazard exposure is elevated; route review required." },
  "INSUFFICIENT DATA": { icon: HelpCircle, className: "text-[var(--color-fg-3)]", note: "Capacity or exposure evidence is missing — feasibility cannot be assessed." },
  "NOT FEASIBLE": { icon: CircleDashed, className: "text-immediate", note: "No eligible destination passed the assessment gate." },
};

export function deriveFeasibility(destination?: Destination, recommendation?: Recommendation): FeasibilityStatus {
  if (!recommendation && !destination) return "INSUFFICIENT DATA";
  if (recommendation && !recommendation.destinationId) return "NOT FEASIBLE";
  if (destination && (destination.usableCapacity === null || destination.requiredCapacity === null)) return "INSUFFICIENT DATA";
  if (destination?.hazardExposure === "High") return "ROUTE RISK";
  if (recommendation?.capacityStatus === "SUFFICIENT") return "FEASIBLE";
  if (recommendation?.capacityStatus === "INSUFFICIENT") return "CAPACITY LIMITED";
  if (destination) {
    if (destination.status === "FULL" || destination.eligible === false) return "CAPACITY LIMITED";
    if (destination.eligible === true) return "FEASIBLE";
  }
  return "INSUFFICIENT DATA";
}

export function FeasibilityBadge({ status, compact = false }: { status: FeasibilityStatus; compact?: boolean }) {
  const { icon: Icon, className, note } = config[status];
  return (
    <span
      title={note}
      className={`inline-flex items-center gap-1.5 border border-[var(--color-line)] px-2 py-0.5 text-[9.5px] font-semibold tracking-[0.14em] ${className}`}
    >
      <Icon size={compact ? 11 : 13} aria-hidden="true" />
      {status}
    </span>
  );
}

/** WORKFLOW — the relocation decision chain as one horizontal flow. Steps the
 *  contract cannot populate (travel time, distance, route) render as
 *  unavailable rather than simulated. */
export function WorkflowChain({ compact = false }: { compact?: boolean }) {
  const steps: { label: string; unavailable?: boolean }[] = [
    { label: "HABITATION" },
    { label: "CANDIDATES" },
    { label: "CAPACITY" },
    { label: "ROAD NETWORK", unavailable: true },
    { label: "TRAVEL TIME", unavailable: true },
    { label: "DISTANCE", unavailable: true },
    { label: "ACCESSIBILITY" },
    { label: "ROUTE HAZARD" },
    { label: "FEASIBILITY" },
    { label: "RECOMMENDATION" },
  ];
  const visible = compact ? steps.filter((step) => !step.unavailable) : steps;
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5" aria-label="Relocation workflow: habitation to recommendation">
      {visible.map((step, index) => (
        <li key={step.label} className="flex items-center gap-1.5">
          {index > 0 && (
            <span aria-hidden="true" className="text-[var(--color-fg-3)]">
              →
            </span>
          )}
          <span
            className={`text-[9px] font-semibold tracking-[0.12em] ${step.unavailable ? "text-[var(--color-fg-3)] line-through decoration-[var(--color-fg-3)]/40" : "text-[var(--color-fg-2)]"}`}
          >
            {step.label}
            {step.unavailable && <span className="ml-1 normal-case tracking-normal">N/A</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
