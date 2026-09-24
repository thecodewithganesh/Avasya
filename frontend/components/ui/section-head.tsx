import { ChevronRight } from "lucide-react";
import Link from "next/link";

/** Section header with eyebrow, title, and optional "view all" link. */
export default function SectionHead({
  eyebrow,
  title,
  actionLabel,
  actionHref,
  onAction,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  const action = actionLabel ? (
    actionHref ? (
      <Link
        href={actionHref}
        className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]"
      >
        {actionLabel}
        <ChevronRight size={13} aria-hidden="true" />
      </Link>
    ) : (
      <button
        onClick={onAction}
        className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-accent transition-colors hover:text-[var(--color-fg)]"
      >
        {actionLabel}
        <ChevronRight size={13} aria-hidden="true" />
      </button>
    )
  ) : null;
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-1.5 font-display text-[15px] font-semibold tracking-tight text-[var(--color-fg)]">{title}</h2>
      </div>
      {action}
    </div>
  );
}
