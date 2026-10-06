import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Runs a real MCP tool handler as the signed-in user (same code Claude calls). */
export const runMcpTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ name: z.string().min(1).max(60), args: z.record(z.string(), z.unknown()) }).parse(i))
  .handler(async ({ data, context }) => {
    const { mcpTools } = await import("./tools/registry");
    const tool = mcpTools.find((t) => t.name === data.name);
    if (!tool) return { isError: true, text: `Ferramenta desconhecida: ${data.name}`, structured: null };
    const parsed = z.object(tool.inputSchema ?? {}).strict().safeParse(data.args);
    if (!parsed.success) {
      return { isError: true, text: parsed.error.issues.map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`).join("\n"), structured: null };
    }
    const token = (getRequestHeader("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const ctx = {
      isAuthenticated: () => true,
      getToken: () => token,
      getUserId: () => context.userId,
      getUserEmail: () => (context.claims as { email?: string })?.email,
      getClientId: () => "in-app-test-panel",
      getClaims: () => context.claims,
      signal: new AbortController().signal,
      progress: async () => {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (tool.handler as any)(parsed.data, ctx);
    const text = (res?.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
    return { isError: !!res?.isError, text, structured: res?.structuredContent ? JSON.stringify(res.structuredContent, null, 2) : null };
  });
