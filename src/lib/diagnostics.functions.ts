import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DiagStatus = "ok" | "warn" | "error";

export const getDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Backend: simple read to confirm the database answers.
    const t0 = Date.now();
    const { error: dbError } = await supabase.from("tasks").select("id").limit(1);
    const dbLatencyMs = Date.now() - t0;

    // Google Calendar
    const hasClientId = !!process.env.GOOGLE_OAUTH_CLIENT_ID;
    const hasClientSecret = !!process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const { data: conn, error: connError } = await supabase
      .from("google_connections")
      .select("last_sync_at, expires_at, refresh_token")
      .maybeSingle();

    return {
      userId,
      backend: {
        envOk: !!process.env.SUPABASE_URL && !!process.env.SUPABASE_PUBLISHABLE_KEY,
        dbOk: !dbError,
        dbError: dbError?.message ?? null,
        dbLatencyMs,
      },
      google: {
        credentialsOk: hasClientId && hasClientSecret,
        queryError: connError?.message ?? null,
        connected: !!conn?.refresh_token,
        lastSyncAt: conn?.last_sync_at ?? null,
        expiresAt: conn?.expires_at ?? null,
      },
      checkedAt: new Date().toISOString(),
    };
  });
