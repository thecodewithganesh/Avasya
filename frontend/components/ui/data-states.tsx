import { AlertTriangle, Inbox } from "lucide-react";

/** Shared loading / empty / error states. Restraint over spectacle. */

export function TileSkeleton({ className = "h-24" }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />;
}

export function RowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="panel p-5" aria-label="Loading data">
      <div className="space-y-3.5">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="skeleton h-9" />
        ))}
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-label="Loading dashboard">
      <div className="skeleton h-9 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <TileSkeleton key={index} className="h-28" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.65fr_1fr]">
        <TileSkeleton className="h-[420px]" />
        <TileSkeleton className="h-[420px]" />
      </div>
      <RowSkeleton rows={4} />
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="panel grid-motif flex min-h-36 flex-col items-center justify-center p-8 text-center">
      <Inbox size={20} className="text-[var(--color-fg-3)]" aria-hidden="true" />
      <div className="mt-3 font-display text-sm font-semibold text-[var(--color-fg)]">{title}</div>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-[var(--color-fg-3)]">{description}</p>}
    </div>
  );
}

/**
 * Generic error state. The old version asserted "The data service did not
 * respond" for every failure — that collapses NETWORK_ERROR, NO DATA and
 * DATA_UNAVAILABLE into one lie. Pages that know the ApiError kind should use
 * TaxonomyErrorState (ui/error-state.tsx); this one stays for callers that
 * only have a boolean, and its subtitle no longer asserts a network failure.
 */
export function ErrorState({ message, detail, onRetry }: { message: string; detail?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="panel flex min-h-36 flex-col items-center justify-center p-8 text-center">
      <AlertTriangle size={20} className="text-immediate" aria-hidden="true" />
      <div className="mt-3 font-display text-sm font-semibold text-[var(--color-fg)]">{message}</div>
      <p className="mt-1.5 text-xs text-[var(--color-fg-3)]">{detail ?? "The request could not be completed. Nothing has changed on your side."}</p>
      <button onClick={onRetry} className="btn btn-outline mt-4">
        Retry
      </button>
    </div>
  );
}
