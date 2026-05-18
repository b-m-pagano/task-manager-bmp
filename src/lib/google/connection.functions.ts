import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAuthUrl } from "./oauth.server";

export function getPublicOrigin(): string {
  const forwardedHost = getRequestHeader("x-forwarded-host");
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const host = forwardedHost ?? getRequestHost();
  const proto = forwardedProto ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function getRedirectUri(): string {
  return `${getPublicOrigin()}/api/public/google/callback`;
}

export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data } = await supabase
      .from("google_connections")
      .select("last_sync_at, expires_at, refresh_token")
      .maybeSingle();
    return {
      connected: !!data?.refresh_token,
      lastSyncAt: data?.last_sync_at ?? null,
      expiresAt: data?.expires_at ?? null,
    };
  });

export const getGoogleAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return {
      url: buildAuthUrl({
        userId: context.userId,
        redirectUri: getRedirectUri(),
      }),
    };
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("google_connections").delete().eq("user_id", userId);
    return { ok: true };
  });

export const upsertGoogleSessionTokens = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        access_token: z.string().min(10),
        refresh_token: z.string().min(10).optional(),
        expires_in: z.number().int().positive().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const expiresAt = data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000).toISOString()
      : null;
    const patch = {
      user_id: userId,
      access_token: data.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    };
    await supabase.from("google_connections").upsert(patch, { onConflict: "user_id" });
    return { ok: true };
  });
