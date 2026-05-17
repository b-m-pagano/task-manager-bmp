// Server-only helpers para o fluxo OAuth do Google Calendar e refresh de tokens.
import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

function getStateSecret(): string {
  // Reaproveita o service role key como segredo HMAC (server-only).
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for state signing");
  return s;
}

function getClientCreds() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Google OAuth não configurado: defina GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET.",
    );
  }
  return { clientId, clientSecret };
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signState(payload: { userId: string; nonce: string; ts: number }): string {
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(createHmac("sha256", getStateSecret()).update(body).digest());
  return `${body}.${mac}`;
}

export function verifyState(state: string): { userId: string; nonce: string; ts: number } | null {
  const [body, mac] = state.split(".");
  if (!body || !mac) return null;
  const expected = b64url(createHmac("sha256", getStateSecret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8"));
    if (Date.now() - payload.ts > 10 * 60 * 1000) return null; // 10min
    return payload;
  } catch {
    return null;
  }
}

export function buildAuthUrl(opts: { userId: string; redirectUri: string }): string {
  const { clientId } = getClientCreds();
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const state = signState({
    userId: opts.userId,
    nonce: b64url(Buffer.from(nonceBytes)),
    ts: Date.now(),
  });
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", opts.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in: number; // seconds
  scope?: string;
  token_type?: string;
}

export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getClientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange falhou: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getClientCreds();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google refresh falhou: ${res.status} ${await res.text()}`);
  return res.json();
}
