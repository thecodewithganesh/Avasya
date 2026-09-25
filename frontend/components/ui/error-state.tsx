import { AlertTriangle, Inbox, ShieldAlert, Unplug } from "lucide-react";
import { ApiError } from "@/types/api";

/**
 * Error taxonomy → UI. Part 16 of the audit contract:
 * a NETWORK/API failure, NO DATA, and INSUFFICIENT EVIDENCE are fundamentally
 * different situations and must never share one "data service did not respond"
 * message. API_ERROR kind → distinct headline + explanation, each with an
 * explicit provenance-style tag so the state itself is truthful about cause.
 */

type Taxonomy = {
  tag: string;
  tone: string;
  headline: string;
  detail: string;
};

export function errorTaxonomy(error: unknown): Taxonomy {
  if (error instanceof ApiError) {
    if (error.kind === "network" || error.status === 0) {
      return {
        tag: "NETWORK_ERROR",
        tone: "immediate",
        headline: "AVASYA could not reach the decision service.",
        detail: "The backend did not respond. Nothing on your side changed; the request never reached the service.",
      };
    }
    if (error.status === 404 || error.kind === "not-found") {
      return {
        tag: "NO_DATA",
        tone: "fg-2",
        headline: "No matching record was found.",
        detail: "The service is reachable, but it has no record for this identifier.",
      };
    }
    if (error.status === 401 || error.kind === "auth") {
      return {
        tag: "AUTH_ERROR",
        tone: "immediate",
        headline: "Officer authentication was rejected.",
        detail: "The configured officer identity was not accepted by the backend. Check credentials and retry.",
      };
    }
    if (error.status === 422 || error.kind === "validation") {
      return {
        tag: "VALIDATION_ERROR",
        tone: "medium",
        headline: "The request was rejected as invalid.",
        detail: "The decision service refused the request parameters (HTTP 422).",
      };
    }
    if (error.status === 503 || error.kind === "unavailable") {
      return {
        tag: "DATA_UNAVAILABLE",
        tone: "medium",
        headline: "Required evidence is not available for this record.",
        detail: "The service responded: this record exists but the evidence needed to compute the result is missing. AVASYA does not estimate values without persisted evidence.",
      };
    }
    if (error.status >= 500) {
      return {
        tag: `API_ERROR ${error.status}`,
        tone: "immediate",
        headline: "The decision service reported an internal error.",
        detail: `HTTP ${error.status} from the backend. The request was received but could not be processed. Nothing was changed on your side.`,
      };
    }
    return {
      tag: `API_ERROR ${error.status}`,
      tone: "medium",
      headline: "The decision service returned an unexpected response.",
      detail: `HTTP ${error.status}. Nothing was changed on your side.`,
    };
  }
  return {
    tag: "API_ERROR",
    tone: "immediate",
    headline: error instanceof Error && error.message ? error.message : "The request could not be completed.",
    detail: "Nothing was changed on your side.",
  };
}

/** Icon / accent per taxonomy tone. */
const toneStyle: Record<string, { icon: typeof AlertTriangle; cls: string }> = {
  immediate: { icon: AlertTriangle, cls: "text-immediate" },
  medium: { icon: Unplug, cls: "text-medium" },
  "fg-2": { icon: Inbox, cls: "text-[var(--color-fg-3)]" },
};

export function TaxonomyErrorState({
  error,
  onRetry,
  headline,
  detail,
}: {
  error: unknown;
  onRetry: () => void;
  /** Allow callers to add context, e.g. "Unable to load officer decision data." */
  headline?: string;
  detail?: string;
}) {
  const taxonomy = errorTaxonomy(error);
  const style = toneStyle[taxonomy.tone] ?? toneStyle.immediate;
  const Icon = style.icon;
  return (
    <div role="alert" className="panel flex min-h-36 flex-col items-center justify-center p-8 text-center">
      <Icon size={20} className={style.cls} aria-hidden="true" />
      <div className="mt-2 inline-flex items-center gap-2">
        <span className={`rounded-[3px] border px-1.5 py-0.5 font-display text-[9px] font-semibold tracking-[0.14em] ${style.cls} ${taxonomy.tone === "immediate" ? "border-immediate/40 bg-immediate/10" : taxonomy.tone === "medium" ? "border-medium/40 bg-medium/10" : "border-[var(--color-line)]"}`}>
          {taxonomy.tag}
        </span>
      </div>
      <div className="mt-3 font-display text-sm font-semibold text-[var(--color-fg)]">{headline ?? taxonomy.headline}</div>
      <p className="mt-1.5 max-w-md text-xs leading-5 text-[var(--color-fg-3)]">{detail ?? taxonomy.detail}</p>
      <button onClick={onRetry} className="btn btn-outline mt-4">
        Retry
      </button>
    </div>
  );
}

/** Convenience wrapper preserving the old ErrorState call shape. */
export default function TaxonomyErrorStateDefault(props: Parameters<typeof TaxonomyErrorState>[0]) {
  return <TaxonomyErrorState {...props} />;
}

/** Small inline note used inside other panels — the "did not respond" phrasing
 *  is intentionally gone from the shared component. */
export function EmptyNoData({ title, description }: { title: string; description?: string }) {
  return (
    <div className="panel grid-motif flex min-h-36 flex-col items-center justify-center p-8 text-center">
      <ShieldAlert size={20} className="text-[var(--color-fg-3)]" aria-hidden="true" />
      <div className="mt-3 font-display text-sm font-semibold text-[var(--color-fg)]">{title}</div>
      {description && <p className="mt-1.5 max-w-sm text-xs leading-5 text-[var(--color-fg-3)]">{description}</p>}
    </div>
  );
}
