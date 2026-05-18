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

    const [tasksRes, eventsRes, catsRes, projectsRes, settingsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("is_inbox", false)
        .gte("scheduled_day", first)
        .lte("scheduled_day", last)
        .order("queue_position", { ascending: true }),
      supabase
        .from("calendar_events")
        .select("*")
        .gte("starts_at", `${first}T00:00:00`)
        .lte("ends_at", `${last}T23:59:59`),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("projects").select("*").order("sort_order"),
      supabase.from("user_settings").select("*").maybeSingle(),
    ]);

    return {
      tasks: tasksRes.data ?? [],
      events: eventsRes.data ?? [],
      categories: catsRes.data ?? [],
      projects: projectsRes.data ?? [],
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

export const listMonthData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        from: z.string().regex(ISO_DATE),
        to: z.string().regex(ISO_DATE),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [tasksRes, eventsRes, catsRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,scheduled_day,category_id,status")
        .eq("is_inbox", false)
        .gte("scheduled_day", data.from)
        .lte("scheduled_day", data.to),
      supabase
        .from("calendar_events")
        .select("id,starts_at,ends_at")
        .gte("starts_at", `${data.from}T00:00:00`)
        .lte("ends_at", `${data.to}T23:59:59`),
      supabase.from("categories").select("id,name,color").order("sort_order"),
    ]);
    return {
      tasks: tasksRes.data ?? [],
      events: eventsRes.data ?? [],
      categories: catsRes.data ?? [],
    };
  });

function formatTzOffset(min: number): string {
  const sign = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}

function startTsFromMinute(
  day: string,
  minute: number | null | undefined,
  tzOffsetMinutes?: number | null,
): string | null {
  if (minute == null) return null;
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  // Append the caller's local offset so Postgres timestamptz stores the
  // intended wall-clock time. Without it, the value would be interpreted as
  // UTC and shifted on read (a BRT 8:00 ends up showing as 5:00).
  const offset =
    typeof tzOffsetMinutes === "number" ? formatTzOffset(tzOffsetMinutes) : "";
  return `${day}T${h}:${m}:00${offset}`;
}

const CreateTaskSchema = z.object({
  title: z.string().trim().min(1).max(280),
  description: z.string().max(4000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  estimated_minutes: z.number().int().min(5).max(720).default(30),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  scheduled_day: z.string().regex(ISO_DATE),
  start_minute: z.number().int().min(0).max(1439).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(ISO_DATE).nullable().optional(),
  inbox: z.boolean().optional(),
  tz_offset_minutes: z.number().int().min(-840).max(840).optional(),
});

export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
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
        notes: data.notes ?? null,
        estimated_minutes: data.estimated_minutes,
        priority: data.priority,
        scheduled_day: data.scheduled_day,
        scheduled_start: data.inbox
          ? null
          : startTsFromMinute(data.scheduled_day, data.start_minute, data.tz_offset_minutes),
        queue_position: nextPos,
        category_id: data.category_id ?? null,
        project_id: data.project_id ?? null,
        parent_id: data.parent_id ?? null,
        due_date: data.due_date ?? null,
        is_inbox: data.inbox ?? false,
      } as never)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

const UpdateTaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(280).optional(),
  description: z.string().max(4000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  estimated_minutes: z.number().int().min(5).max(720).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
  category_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  parent_id: z.string().uuid().nullable().optional(),
  scheduled_day: z.string().regex(ISO_DATE).optional(),
  start_minute: z.number().int().min(0).max(1439).nullable().optional(),
  due_date: z.string().regex(ISO_DATE).nullable().optional(),
  queue_position: z.number().int().min(0).optional(),
  pinned_at: z.string().datetime().nullable().optional(),
  quick_note: z.string().max(500).nullable().optional(),
  tz_offset_minutes: z.number().int().min(-840).max(840).optional(),
});

export const updateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => UpdateTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { id, start_minute, scheduled_day, tz_offset_minutes, ...rest } = data;
    const patch: Record<string, any> = { ...rest };
    if (scheduled_day !== undefined) patch.scheduled_day = scheduled_day;
    if (start_minute !== undefined) {
      const day = scheduled_day ?? null;
      if (day) {
        patch.scheduled_start = startTsFromMinute(day, start_minute, tz_offset_minutes);
      } else {
        // Need current day to compose; fetch row.
        const { data: existing } = await context.supabase
          .from("tasks")
          .select("scheduled_day")
          .eq("id", id)
          .single();
        if (existing) {
          patch.scheduled_start = startTsFromMinute(
            existing.scheduled_day,
            start_minute,
            tz_offset_minutes,
          );
        }
      }
    }
    if (patch.status === "done") {
      patch.completed_at = new Date().toISOString();
    } else if (rest.status && rest.status !== "done") {
      patch.completed_at = null;
    }
    const { data: row, error } = await context.supabase
      .from("tasks")
      .update(patch as never)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const duplicateTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: src, error: e1 } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", data.id)
      .single();
    if (e1 || !src) throw e1 ?? new Error("Tarefa não encontrada");

    const { data: maxRow } = await supabase
      .from("tasks")
      .select("queue_position")
      .eq("scheduled_day", src.scheduled_day)
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.queue_position ?? -1) + 1;

    const { id: _drop, created_at: _c, updated_at: _u, completed_at: _cc, ...rest } = src as any;
    const { data: row, error } = await supabase
      .from("tasks")
      .insert({
        ...rest,
        user_id: userId,
        title: `${src.title} (cópia)`,
        status: "pending",
        completed_at: null,
        queue_position: nextPos,
        pinned_at: null,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listSubtasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ parent_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("tasks")
      .select("*")
      .eq("parent_id", data.parent_id)
      .order("queue_position", { ascending: true });
    if (error) throw error;
    return rows ?? [];
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

const RescheduleSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().uuid(),
        scheduled_day: z.string().regex(ISO_DATE),
        start_minute: z.number().int().min(0).max(1439),
      }),
    )
    .min(1)
    .max(100),
});

/**
 * Bulk apply scheduling changes produced by the reflow engine.
 * Each row gets new scheduled_day + scheduled_start in a single round-trip set.
 */
export const rescheduleTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RescheduleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await Promise.all(
      data.updates.map((u) =>
        supabase
          .from("tasks")
          .update({
            scheduled_day: u.scheduled_day,
            scheduled_start: startTsFromMinute(u.scheduled_day, u.start_minute),
          })
          .eq("id", u.id)
          .eq("user_id", userId),
      ),
    );
    return { ok: true, count: data.updates.length };
  });

export const carryUnfinished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);
    const { data: stale } = await supabase
      .from("tasks")
      .select("id, queue_position")
      .eq("is_inbox", false)
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
        .update({
          scheduled_day: today,
          queue_position: i,
          // Migradas tornam-se prioridade máxima.
          priority: "urgent",
          scheduled_start: null,
        })
        .eq("id", stale[i].id)
        .eq("user_id", userId);
    }
    return { moved: stale.length };
  });

// ─────────────────────────────────────────────────────────────────────────────
// INBOX
// ─────────────────────────────────────────────────────────────────────────────

export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("is_inbox", true)
      .is("parent_id", null)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const sendToInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("tasks")
      .update({ is_inbox: true, scheduled_start: null, pinned_at: null } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

const ScheduleFromInboxSchema = z.object({
  id: z.string().uuid(),
  scheduled_day: z.string().regex(ISO_DATE),
  start_minute: z.number().int().min(0).max(1439).nullable().optional(),
});

export const scheduleFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ScheduleFromInboxSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: maxRow } = await supabase
      .from("tasks")
      .select("queue_position")
      .eq("scheduled_day", data.scheduled_day)
      .eq("user_id", userId)
      .eq("is_inbox", false)
      .order("queue_position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextPos = (maxRow?.queue_position ?? -1) + 1;
    const { error } = await supabase
      .from("tasks")
      .update({
        is_inbox: false,
        scheduled_day: data.scheduled_day,
        scheduled_start: startTsFromMinute(data.scheduled_day, data.start_minute ?? null),
        queue_position: nextPos,
      } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });
