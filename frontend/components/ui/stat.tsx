import type { ReactNode } from "react";

/** Labeled data point — the Swiss definition-list cell used across detail screens. */
export default function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[13px] font-medium text-[var(--color-fg)]">{value}</div>
    </div>
  );
}
