import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { expandRecurrence, type RecurrenceRule } from "@/lib/queue/recurrence";



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
          day_start_minute: 420,
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

const RecurrenceSchema = z.object({
  freq: z.enum(["daily", "weekly", "biweekly", "monthly", "custom"]),
  interval: z.number().int().min(1).max(99).optional(),
  unit: z.enum(["day", "week", "month"]).optional(),
  byweekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: z.string().regex(ISO_DATE).nullable().optional(),
});

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
  recurrence: RecurrenceSchema.nullable().optional(),
});


export const createTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Recurrence branch: materialize all occurrences sharing a series_id.
    if (data.recurrence && !data.inbox) {
      const rule: RecurrenceRule = data.recurrence;
      const days = expandRecurrence(data.scheduled_day, rule);
      if (days.length === 0) throw new Error("Regra de repetição não gerou ocorrências");

      // Fetch current max queue_position per day in one round-trip.
      const { data: existing } = await supabase
        .from("tasks")
        .select("scheduled_day, queue_position")
        .in("scheduled_day", days);
      const maxByDay = new Map<string, number>();
      for (const r of existing ?? []) {
        const prev = maxByDay.get(r.scheduled_day) ?? -1;
        if (r.queue_position > prev) maxByDay.set(r.scheduled_day, r.queue_position);
      }

      const seriesId = crypto.randomUUID();
      const rows = days.map((d) => {
        const pos = (maxByDay.get(d) ?? -1) + 1;
        maxByDay.set(d, pos);
        return {
          user_id: userId,
          title: data.title,
          description: data.description ?? null,
          notes: data.notes ?? null,
          estimated_minutes: data.estimated_minutes,
          priority: data.priority,
          scheduled_day: d,
          scheduled_start: startTsFromMinute(d, data.start_minute, data.tz_offset_minutes),
          queue_position: pos,
          category_id: data.category_id ?? null,
          project_id: data.project_id ?? null,
          parent_id: data.parent_id ?? null,
          due_date: data.due_date ?? null,
          is_inbox: false,
          series_id: seriesId,
          recurrence_rule: JSON.stringify(rule),
          recurrence_end_date: rule.until ?? null,
        };
      });

      const { data: inserted, error } = await supabase
        .from("tasks")
        .insert(rows as never)
        .select();
      if (error) throw error;
      return { series_id: seriesId, count: inserted?.length ?? 0, first: inserted?.[0] ?? null };
    }

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
  tz_offset_minutes: z.number().int().min(-840).max(840).optional(),
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
            scheduled_start: startTsFromMinute(u.scheduled_day, u.start_minute, data.tz_offset_minutes),
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
  tz_offset_minutes: z.number().int().min(-840).max(840).optional(),
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
        scheduled_start: startTsFromMinute(
          data.scheduled_day,
          data.start_minute ?? null,
          data.tz_offset_minutes,
        ),
        queue_position: nextPos,
      } as never)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// RECURRENCE SERIES
// ─────────────────────────────────────────────────────────────────────────────

export const deleteSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        series_id: z.string().uuid(),
        from_date: z.string().regex(ISO_DATE).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("tasks")
      .delete()
      .eq("series_id", data.series_id)
      .eq("user_id", userId);
    if (data.from_date) q = q.gte("scheduled_day", data.from_date);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

const UpdateSeriesPatch = z.object({
  title: z.string().trim().min(1).max(280).optional(),
  description: z.string().max(4000).nullable().optional(),
  notes: z.string().max(10_000).nullable().optional(),
  estimated_minutes: z.number().int().min(5).max(720).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  category_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
});

export const updateSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        series_id: z.string().uuid(),
        from_date: z.string().regex(ISO_DATE).nullable().optional(),
        patch: UpdateSeriesPatch,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("tasks")
      .update(data.patch as never)
      .eq("series_id", data.series_id)
      .eq("user_id", userId);
    if (data.from_date) q = q.gte("scheduled_day", data.from_date);
    const { error } = await q;
    if (error) throw error;
    return { ok: true };
  });

// ─────────────────────────────────────────────────────────────────────────────
// LIST (universal tasks listing with filters)
// ─────────────────────────────────────────────────────────────────────────────

const ListTasksSchema = z.object({
  scope: z.enum(["todo", "done", "all"]).default("todo"),
  search: z.string().trim().max(200).optional(),
  categoryIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  priorities: z.array(z.enum(["low", "medium", "high", "urgent"])).optional(),
  createdFrom: z.string().regex(ISO_DATE).optional(),
  createdTo: z.string().regex(ISO_DATE).optional(),
  completedFrom: z.string().regex(ISO_DATE).optional(),
  completedTo: z.string().regex(ISO_DATE).optional(),
  scheduledFrom: z.string().regex(ISO_DATE).optional(),
  scheduledTo: z.string().regex(ISO_DATE).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
});

export const listTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ListTasksSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("tasks")
      .select("*", { count: "exact" })
      .eq("is_inbox", false)
      .is("parent_id", null);

    if (data.scope === "todo") q = q.is("completed_at", null);
    else if (data.scope === "done") q = q.not("completed_at", "is", null);

    if (data.search) {
      const s = data.search.replace(/[%_]/g, "\\$&");
      q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%`);
    }

    if (data.categoryIds?.length) {
      const hasNone = data.categoryIds.includes("none");
      const real = data.categoryIds.filter((c) => c !== "none");
      if (hasNone && real.length === 0) q = q.is("category_id", null);
      else if (hasNone) q = q.or(`category_id.is.null,category_id.in.(${real.join(",")})`);
      else q = q.in("category_id", real);
    }
    if (data.projectIds?.length) {
      const hasNone = data.projectIds.includes("none");
      const real = data.projectIds.filter((c) => c !== "none");
      if (hasNone && real.length === 0) q = q.is("project_id", null);
      else if (hasNone) q = q.or(`project_id.is.null,project_id.in.(${real.join(",")})`);
      else q = q.in("project_id", real);
    }
    if (data.priorities?.length) q = q.in("priority", data.priorities);

    if (data.createdFrom) q = q.gte("created_at", `${data.createdFrom}T00:00:00`);
    if (data.createdTo) q = q.lte("created_at", `${data.createdTo}T23:59:59`);
    if (data.completedFrom) q = q.gte("completed_at", `${data.completedFrom}T00:00:00`);
    if (data.completedTo) q = q.lte("completed_at", `${data.completedTo}T23:59:59`);
    if (data.scheduledFrom) q = q.gte("scheduled_day", data.scheduledFrom);
    if (data.scheduledTo) q = q.lte("scheduled_day", data.scheduledTo);

    if (data.scope === "done") {
      q = q.order("completed_at", { ascending: false });
    } else {
      q = q
        .order("scheduled_day", { ascending: true })
        .order("queue_position", { ascending: true });
    }
    q = q.range(data.offset, data.offset + data.limit - 1);

    const { data: rows, error, count } = await q;
    if (error) throw error;

    const [catsRes, projectsRes] = await Promise.all([
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("projects").select("*").order("sort_order"),
    ]);

    return {
      tasks: rows ?? [],
      total: count ?? 0,
      categories: catsRes.data ?? [],
      projects: projectsRes.data ?? [],
    };
  });
