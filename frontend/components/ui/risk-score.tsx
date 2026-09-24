import type { RiskLevel } from "@/types/api";

const levelColor: Record<RiskLevel, string> = {
  HIGH: "var(--color-immediate)",
  MEDIUM: "var(--color-short)",
  LOW: "var(--color-safe)",
};
const levelLabel: Record<RiskLevel, string> = { HIGH: "HIGH RISK", MEDIUM: "MEDIUM", LOW: "LOW RISK" };

/**
 * Compact: mono score + urgency-colored meter, for tables and rows.
 * Full: oversized editorial score with /100 and level label.
 * Null-safe: no persisted assessment renders an explicit pending state —
 * missing evidence is never fabricated.
 */
export default function RiskScore({
  score,
  level,
  compact = false,
}: {
  score: number | null;
  level: RiskLevel | null;
  compact?: boolean;
}) {
  if (score === null || level === null) {
    if (compact) {
      return (
        <div className="min-w-16" aria-label="Risk assessment pending">
          <span className="metric text-[13px] text-[var(--color-fg-3)]">—</span>
          <div className="mt-1 font-display text-[8px] tracking-[0.12em] text-[var(--color-fg-3)]">PENDING</div>
        </div>
      );
    }
    return (
      <div aria-label="Risk assessment pending">
        <div className="font-display text-xl font-semibold tracking-tight text-[var(--color-fg-3)]">PENDING</div>
        <div className="mt-2 text-[11px] leading-5 text-[var(--color-fg-3)]">
          No risk assessment is persisted for this record yet.
        </div>
      </div>
    );
  }
  const color = levelColor[level];
  if (compact) {
    return (
      <div className="min-w-16" aria-label={`Risk score ${score} out of 100, ${levelLabel[level]}`}>
        <div className="flex items-baseline gap-1">
          <span className="metric text-[15px] font-semibold text-[var(--color-fg)]">{score}</span>
          <span className="font-display text-[8px] tracking-[0.12em]" style={{ color }}>
            {level}
          </span>
        </div>
        <div className="bar-track mt-1" style={{ width: 56 }}>
          <div className="bar-fill" style={{ width: `${score}%`, background: color }} />
        </div>
      </div>
    );
  }
  return (
    <div aria-label={`Total risk ${score} out of 100, ${levelLabel[level]}`}>
      <div className="flex items-start gap-2">
        <span className="hero-stat">{score}</span>
        <span className="metric mt-2 text-sm text-[var(--color-fg-3)]">/ 100</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="tick" style={{ background: color }} />
        <span className="font-display text-xs font-semibold tracking-[0.16em]" style={{ color }}>
          {levelLabel[level]}
        </span>
      </div>
    </div>
  );
}
