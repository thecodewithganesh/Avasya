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
