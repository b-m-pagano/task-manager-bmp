import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const listWeekData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        days: z.array(z.string().regex(ISO_DATE)).min(1).max(14),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const first = data.days[0];
    const last = data.days[data.days.length - 1];

    const [tasksRes, eventsRes, catsRes, settingsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .gte("scheduled_day", first)
        .lte("scheduled_day", last)
        .order("queue_position", { ascending: true }),
      supabase
        .from("calendar_events")
        .select("*")
        .gte("starts_at", `${first}T00:00:00`)
        .lte("ends_at", `${last}T23:59:59`),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("user_settings").select("*").maybeSingle(),
    ]);

    return {
      tasks: tasksRes.data ?? [],
      events: eventsRes.data ?? [],
      categories: catsRes.data ?? [],
      settings:
        settingsRes.data ?? {
          user_id: context.userId,
          day_start_minute: 480,
          after_hours_minute: 1080,
          buffer_minutes: 5,
          carry_unfinished: true,
          theme: "system",
        },
    };
  });

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        title: z.string().min(1).max(280),
        description: z.string().max(4000).optional(),
        estimated_minutes: z.number().int().min(5).max(720).default(30),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        scheduled_day: z.string().regex(ISO_DATE),
        category_id: z.string().uuid().nullable().optional(),
        parent_id: z.string().uuid().nullable().optional(),
        due_date: z.string().regex(ISO_DATE).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // queue_position = max + 1 within day
    const { data: maxRow } = await supabase
      .from("tasks")
      .select("queue_position")
      .eq("scheduled_day", data.scheduled_day)
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.queue_position ?? -1) + 1;

    const { data: row, error } = await supabase
      .from("tasks")
      .insert({
        user_id: userId,
        title: data.title,
        description: data.description ?? null,
        estimated_minutes: data.estimated_minutes,
        priority: data.priority,
        scheduled_day: data.scheduled_day,
        queue_position: nextPos,
        category_id: data.category_id ?? null,
        parent_id: data.parent_id ?? null,
        due_date: data.due_date ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().min(1).max(280).optional(),
        description: z.string().max(4000).nullable().optional(),
        estimated_minutes: z.number().int().min(5).max(720).optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
        category_id: z.string().uuid().nullable().optional(),
        scheduled_day: z.string().regex(ISO_DATE).optional(),
        queue_position: z.number().int().min(0).optional(),
        pinned_at: z.string().datetime().nullable().optional(),
        quick_note: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const deleteTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("tasks").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const reorderDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scheduled_day: z.string().regex(ISO_DATE),
        ordered_ids: z.array(z.string().uuid()).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Update each row's queue_position + scheduled_day.
    // Small N, sequential is fine.
    for (let i = 0; i < data.ordered_ids.length; i++) {
      await supabase
        .from("tasks")
        .update({ scheduled_day: data.scheduled_day, queue_position: i, pinned_at: null })
        .eq("id", data.ordered_ids[i])
        .eq("user_id", userId);
    }
    return { ok: true };
  });

export const carryUnfinished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: stale } = await supabase
      .from("tasks")
      .select("id, queue_position")
      .lt("scheduled_day", today)
      .eq("status", "pending")
      .order("scheduled_day", { ascending: true })
      .order("queue_position", { ascending: true });

    if (!stale || stale.length === 0) return { moved: 0 };

    // Shift today's existing tasks down
    const { data: todays } = await supabase
      .from("tasks")
      .select("id, queue_position")
      .eq("scheduled_day", today)
      .order("queue_position", { ascending: true });

    const offset = stale.length;
    for (const t of todays ?? []) {
      await supabase
        .from("tasks")
        .update({ queue_position: t.queue_position + offset })
        .eq("id", t.id)
        .eq("user_id", userId);
    }
    for (let i = 0; i < stale.length; i++) {
      await supabase
        .from("tasks")
        .update({ scheduled_day: today, queue_position: i })
        .eq("id", stale[i].id)
        .eq("user_id", userId);
    }
    return { moved: stale.length };
  });
