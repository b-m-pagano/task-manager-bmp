import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { UIMessage } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listAssistantThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assistant_threads").select("id,title,updated_at")
      .order("updated_at", { ascending: false }).limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assistant_threads").insert({ user_id: context.userId }).select("id").single();
    if (error) throw new Error(error.message);
    return data.id;
  });

export const deleteAssistantThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("assistant_threads").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return true;
  });

export const getAssistantMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assistant_messages").select("message")
      .eq("thread_id", data.id).order("created_at");
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => r.message);
  });

export function parseMessages(raw: unknown): UIMessage[] {
  return (raw as UIMessage[]) ?? [];
}
