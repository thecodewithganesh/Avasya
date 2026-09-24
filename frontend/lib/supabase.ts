/**
 * Optional Supabase browser client (auth today; storage/realtime later).
 *
 * Enabled only when BOTH public env vars are set at build time:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * When enabled, `lib/api.ts` attaches the user's Supabase access token as
 * `Authorization: Bearer <jwt>`; the backend verifies it against
 * SUPABASE_JWT_SECRET (backend/integrations/supabase.py). When disabled the
 * documented demo-officer header mechanism is used unchanged.
 *
 * Security: only the ANON (publishable) key ever lives in frontend code.
 * The service-role key and JWT secret are backend-only secrets.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_ENABLED = Boolean(URL && ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_ENABLED) return null;
  if (!client) {
    client = createClient(URL as string, ANON_KEY as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** Access token for the current session, or null when signed out/disabled. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
