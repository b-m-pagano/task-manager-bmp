import { createFileRoute } from "@tanstack/react-router";
import { getRedirectUri, getPublicOrigin } from "@/lib/google/origin.server";

export const Route = createFileRoute("/api/public/debug/oauth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const headers = Object.fromEntries(request.headers.entries());

        const safeHeaders = {
          "x-forwarded-host": headers["x-forwarded-host"] ?? null,
          "x-forwarded-proto": headers["x-forwarded-proto"] ?? null,
          "x-forwarded-for": headers["x-forwarded-for"] ?? null,
          host: headers["host"] ?? null,
          origin: headers["origin"] ?? null,
          referer: headers["referer"] ?? null,
        };

        const detectedOrigin = getPublicOrigin();
        const redirectUri = getRedirectUri();

        return Response.json({
          url: request.url,
          safeHeaders,
          detectedOrigin,
          redirectUri,
          env: {
            // Nunca exponha segredos completos; mostre apenas se existem
            hasGoogleClientId: !!process.env.GOOGLE_OAUTH_CLIENT_ID,
            hasGoogleClientSecret: !!process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
          },
        });
      },
    },
  },
});
