// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// Public (publishable) backend values. Used only as a fallback when the build
// environment does not provide them, so the published site never ships without
// a backend connection. These are public keys — safe to embed.
const FALLBACK_SUPABASE_URL = "https://hjkcuaqpucrxumpmuejk.supabase.co";
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhqa2N1YXFwdWNyeHVtcG11ZWprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg5Nzc1MzgsImV4cCI6MjA5NDU1MzUzOH0.SAEXX1sGoJAxYPh_1f49NoUNYv9Q1FfkuOgGr7d-4eg";
const FALLBACK_SUPABASE_PROJECT_ID = "hjkcuaqpucrxumpmuejk";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || FALLBACK_SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  FALLBACK_SUPABASE_PUBLISHABLE_KEY;
const supabaseProjectId =
  process.env.VITE_SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_ID ||
  FALLBACK_SUPABASE_PROJECT_ID;

// Make sure server code (process.env reads) also sees the values at runtime.
process.env.SUPABASE_URL ||= supabaseUrl;
process.env.SUPABASE_PUBLISHABLE_KEY ||= supabaseKey;
process.env.VITE_SUPABASE_URL ||= supabaseUrl;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||= supabaseKey;
process.env.VITE_SUPABASE_PROJECT_ID ||= supabaseProjectId;

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  plugins: [mcpPlugin()],
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(supabaseUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(supabaseKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(supabaseProjectId),
    },
  },
});
