import type { ReactNode } from "react";

/** Page-level header: contextual eyebrow, editorial title, actions slot. */
export default function PageHead({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-[var(--color-fg)] lg:text-[28px]">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--color-fg-2)]">{description}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
