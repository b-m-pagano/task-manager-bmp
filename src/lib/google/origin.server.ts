import { getRequestHeader, getRequestHost } from "@tanstack/react-start/server";

export function getPublicOrigin(): string {
  const forwardedHost = getRequestHeader("x-forwarded-host");
  const forwardedProto = getRequestHeader("x-forwarded-proto");
  const host = forwardedHost ?? getRequestHost();
  const proto = forwardedProto ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function getRedirectUri(): string {
  return `${getPublicOrigin()}/api/public/google/callback`;
}
