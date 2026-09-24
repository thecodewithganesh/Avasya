import type { Priority } from "@/types/api";

const styles: Record<Priority | "LOW" | "PENDING", { label: string; className: string }> = {
  IMMEDIATE: { label: "IMMEDIATE", className: "text-immediate border-immediate/40 bg-immediate/10" },
  "SHORT-TERM": { label: "SHORT-TERM", className: "text-short border-short/40 bg-short/10" },
  "MEDIUM-TERM": { label: "MEDIUM-TERM", className: "text-medium border-medium/40 bg-medium/10" },
  LOW: { label: "LOW", className: "text-safe border-safe/40 bg-safe/10" },
  PENDING: { label: "PRIORITY PENDING", className: "text-[var(--color-fg-3)] border-[var(--color-line)] bg-transparent" },
};

export default function PriorityBadge({ priority }: { priority: Priority | "LOW" | "PENDING" | null }) {
  const style = styles[priority ?? "PENDING"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 font-display text-[9px] font-semibold tracking-[0.14em] ${style.className}`}
    >
      {style.label !== "PRIORITY PENDING" && <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-current" />}
      {style.label}
    </span>
  );
}
