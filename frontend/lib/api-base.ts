/**
 * Shared API base URLs.
 *
 * Extracted from lib/api.ts so evidence-api.ts can target the same backend
 * without importing the whole API client (and its mock dataset graph).
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:58000").replace(/\/$/, "");
export const API_V1 = `${BASE}/api/v1`;

/**
 * Server-side fallback base. NEXT_PUBLIC_API_URL is baked in at build time
 * for the BROWSER (where localhost:<host-port> is correct). But when Next
 * itself renders/fetches on the server inside Docker, "localhost" is the
 * frontend container — the backend is reachable at the compose service
 * name instead. The browser value always wins when we're actually in a
 * browser (typeof window), so this only affects server-side execution.
 */
export const SERVER_API_V1 =
  typeof window === "undefined" && process.env.SERVER_SIDE_API_URL
    ? `${process.env.SERVER_SIDE_API_URL.replace(/\/$/, "")}/api/v1`
    : API_V1;

/**
 * Single source of truth for the LIVE/DEMO data-mode switch (audit Part 14).
 * LIVE is the default: an unset env var must never silently downgrade the UI
 * to synthetic data. DEMO requires explicit opt-in via
 * NEXT_PUBLIC_DATA_MODE=demo (preferred) or NEXT_PUBLIC_USE_MOCK_DATA=true;
 * the legacy ="false" kill-switch is still honoured.
 */
export function resolveUseMockData(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "false") return false;
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true") return true;
  const dataMode = (process.env.NEXT_PUBLIC_DATA_MODE || "").toLowerCase();
  if (dataMode === "demo" || dataMode === "mock") return true;
  if (dataMode === "live") return false;
  return false;
}
