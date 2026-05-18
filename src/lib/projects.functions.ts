import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("projects")
      .select("*")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

export const upsertProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().min(1).max(120),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#6366f1"),
        icon: z.string().max(40).default("folder"),
        description: z.string().max(2000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("projects")
        .update({
          name: data.name,
          color: data.color,
          icon: data.icon,
          description: data.description ?? null,
        })
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await supabase
      .from("projects")
      .insert({
        user_id: userId,
        name: data.name,
        color: data.color,
        icon: data.icon,
        description: data.description ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("projects")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
