import type { LucideIcon } from "lucide-react";

/** KPI strip tile — quiet structure, one accent tick, mono numeral. */
export default function KpiCard({
  label,
  value,
  detail,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  accent: "immediate" | "short" | "medium" | "safe" | "accent";
}) {
  const colorVar: Record<typeof accent, string> = {
    immediate: "var(--color-immediate)",
    short: "var(--color-short)",
    medium: "var(--color-medium)",
    safe: "var(--color-safe)",
    accent: "var(--color-accent)",
  };
  const color = colorVar[accent];
  return (
    <div className="panel hover-lift p-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span>
        <Icon size={14} strokeWidth={1.8} style={{ color }} aria-hidden="true" />
      </div>
      <div className="metric mt-3 text-[28px] font-semibold leading-none text-[var(--color-fg)]">{value}</div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="tick" style={{ background: color, width: 14 }} />
        <span className="text-[11px] text-[var(--color-fg-3)]">{detail}</span>
      </div>
    </div>
  );
}
