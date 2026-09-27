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

/** Testa de verdade a conexão com o Google: renova o token e consulta a agenda. */
export const testGoogleConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: conn, error: connError } = await supabase
      .from("google_connections")
      .select("refresh_token")
      .maybeSingle();
    if (connError) return { ok: false, step: "banco", detail: connError.message };
    if (!conn?.refresh_token) {
      return { ok: false, step: "conexão", detail: "Nenhuma conta Google conectada." };
    }

    let accessToken: string;
    try {
      const { refreshAccessToken } = await import("./google/oauth.server");
      const tokens = await refreshAccessToken(conn.refresh_token);
      accessToken = tokens.access_token;
    } catch (e) {
      return {
        ok: false,
        step: "renovação do token",
        detail: e instanceof Error ? e.message : String(e),
      };
    }

    const t0 = Date.now();
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?maxResults=1&singleEvents=true&timeMin=" +
        encodeURIComponent(new Date().toISOString()),
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      return { ok: false, step: "leitura da agenda", detail: `Google respondeu ${res.status}` };
    }
    return { ok: true, step: "leitura da agenda", detail: `Agenda respondeu em ${latencyMs} ms`, latencyMs, userId };
  });
