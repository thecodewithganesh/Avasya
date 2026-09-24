import type { DataOrigin } from "@/types/api";

/**
 * Data provenance chip — mandatory per handoff §15:
 * REAL evidence and SYNTHETIC_DEMO records must always be distinguishable.
 */
export default function OriginBadge({ origin }: { origin: DataOrigin }) {
  const style =
    origin === "REAL"
      ? "text-safe border-safe/40 bg-safe/10"
      : origin === "MIXED"
        ? "text-accent border-accent/40 bg-accent/10"
        : "text-insight border-insight/40 bg-insight/10";
  const label = origin === "SYNTHETIC_DEMO" ? "SYNTHETIC DEMO" : origin;
  return (
    <span
      title={`Data origin: ${origin}`}
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-0.5 font-display text-[8px] font-semibold tracking-[0.14em] ${style}`}
    >
      {label}
    </span>
  );
}
