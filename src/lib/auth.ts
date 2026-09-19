import { supabase } from "@/integrations/supabase/client";

/**
 * Clears a stale/invalid session locally (no network round-trip to revoke
 * it server-side). Used on session errors, not for a user-initiated logout.
 */
export async function clearLocalSession() {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* ignore */
  }
}
