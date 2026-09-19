import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { exchangeCodeForTokens, verifyState } from "@/lib/google/oauth.server";

function htmlRedirect(url: string, message: string): Response {
  const safe = url.replace(/"/g, "&quot;");
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Conectando…</title>
<style>body{font:14px system-ui;display:grid;place-items:center;height:100vh;color:#444}</style>
<p>${message}</p>
<script>setTimeout(()=>location.replace("${safe}"),400)</script>`,
    { status: 200, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        // Reconstrói o origin público a partir dos headers do proxy
        // (request.url pode apontar para localhost:8080 dentro do worker).
        const fwdHost = request.headers.get("x-forwarded-host");
        const fwdProto = request.headers.get("x-forwarded-proto");
        const host = fwdHost ?? request.headers.get("host") ?? url.host;
        const proto = fwdProto ?? (host.startsWith("localhost") ? "http" : "https");
        const publicOrigin = `${proto}://${host}`;
        const settingsUrl = `${publicOrigin}/app/settings`;

        if (error) return htmlRedirect(`${settingsUrl}?google=denied`, "Conexão cancelada.");
        if (!code || !state) return new Response("Missing code/state", { status: 400 });

        const payload = verifyState(state);
        if (!payload) return new Response("Invalid state", { status: 400 });

        try {
          const tokens = await exchangeCodeForTokens(
            code,
            `${publicOrigin}/api/public/google/callback`,
          );
          const expiresAt = tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null;

          const patch = {
            user_id: payload.userId,
            access_token: tokens.access_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
            ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
          };

          const { error: dbErr } = await supabaseAdmin
            .from("google_connections")
            .upsert(patch, { onConflict: "user_id" });
          if (dbErr) throw new Error(dbErr.message);

          return htmlRedirect(`${settingsUrl}?google=connected`, "Conectado! Redirecionando…");
        } catch (e) {
          console.error("[google/callback]", e);
          return htmlRedirect(`${settingsUrl}?google=error`, "Falha ao conectar. Redirecionando…");
        }
      },
    },
  },
});
