/**
 * Operações de agenda compartilhadas entre o servidor MCP (Claude/ChatGPT)
 * e o assistente interno do app — uma única implementação para os dois.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTzOffset } from "@/lib/timezone";
import { buildTextReplan, type ReplanInstruction } from "@/lib/queue/text-replan";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;
export type Priority = "low" | "medium" | "high" | "urgent";

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const stamp = (day: string, minute: number, tz: number) => `${day}T${hhmm(minute)}:00${formatTzOffset(tz)}`;
const localMinute = (iso: string, tz: number) => {
  const d = new Date(iso);
  return (((d.getUTCHours() * 60 + d.getUTCMinutes() + tz) % 1440) + 1440) % 1440;
};
const addDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
export const parseTime = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export async function getDaySchedule(sb: Sb, day: string, tz: number) {
  const [t, e] = await Promise.all([
    sb.from("tasks").select("id,title,status,priority,scheduled_start,estimated_minutes")
      .eq("scheduled_day", day).eq("is_inbox", false).is("parent_id", null).order("scheduled_start"),
    sb.from("calendar_events").select("title,starts_at,ends_at,all_day,is_blocking")
      .lt("starts_at", stamp(day, 1439, tz)).gt("ends_at", stamp(day, 0, tz)),
  ]);
  if (t.error) throw new Error(t.error.message);
  type T = { id: string; title: string; status: string; priority: Priority; scheduled_start: string | null; estimated_minutes: number | null };
  type E = { title: string; starts_at: string; ends_at: string; all_day: boolean; is_blocking: boolean };
  const tasks = ((t.data ?? []) as T[]).map((x) => ({
    id: x.id, title: x.title, status: x.status, priority: x.priority,
    duration: x.estimated_minutes ?? 30,
    start: x.scheduled_start ? hhmm(localMinute(x.scheduled_start, tz)) : null,
  }));
  const events = ((e.data ?? []) as E[]).map((x) => {
    const s = new Date(x.starts_at) <= new Date(stamp(day, 0, tz)) ? 0 : localMinute(x.starts_at, tz);
    const en = new Date(x.ends_at) >= new Date(stamp(day, 1439, tz)) ? 1440 : localMinute(x.ends_at, tz);
    return { title: x.title, all_day: x.all_day, blocking: x.is_blocking && !x.all_day, start: s, end: en };
  });
  return {
    tasks,
    calendar: events.map((x) => ({ title: x.title, all_day: x.all_day, start: hhmm(x.start), end: hhmm(Math.min(x.end, 1439)) })),
    blocks: events.filter((x) => x.blocking).map((x) => ({ title: x.title, start: x.start, end: x.end })),
  };
}

export async function scheduleTask(sb: Sb, a: { task_id: string; day: string; start_time: string | null; tz: number }) {
  const { data: t } = await sb.from("tasks").select("estimated_minutes").eq("id", a.task_id).maybeSingle();
  const mins = (t as { estimated_minutes: number | null } | null)?.estimated_minutes ?? 30;
  const start = a.start_time ? parseTime(a.start_time) : null;
  const { error } = await sb.from("tasks").update({
    scheduled_day: a.day, is_inbox: false,
    scheduled_start: start != null ? stamp(a.day, start, a.tz) : null,
    scheduled_end: start != null ? stamp(a.day, Math.min(1439, start + mins), a.tz) : null,
  }).eq("id", a.task_id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function listSubtasks(sb: Sb, taskId: string) {
  const { data, error } = await sb.from("tasks").select("id,title,status,estimated_minutes")
    .eq("parent_id", taskId).order("queue_position").order("created_at");
  if (error) throw new Error(error.message);
  const subtasks = (data ?? []) as { id: string; title: string; status: string; estimated_minutes: number }[];
  return { subtasks, done: subtasks.filter((s) => s.status === "done").length, total: subtasks.length };
}

export async function createTaskWithSubtasks(
  sb: Sb, userId: string,
  a: { title: string; steps: { title: string; estimated_minutes?: number | null }[]; day: string | null; priority: Priority | null },
) {
  const prio = a.priority ?? "medium";
  const day = a.day ?? new Date().toISOString().slice(0, 10);
  const total = a.steps.reduce((s, x) => s + (x.estimated_minutes ?? 15), 0);
  const { data: parent, error } = await sb.from("tasks").insert({
    user_id: userId, title: a.title, priority: prio, scheduled_day: day, is_inbox: !a.day,
    estimated_minutes: Math.min(720, Math.max(5, total)),
  }).select("id,title").single();
  if (error) throw new Error(error.message);
  const p = parent as { id: string; title: string };
  const { data, error: e2 } = await sb.from("tasks").insert(a.steps.map((s, i) => ({
    user_id: userId, parent_id: p.id, title: s.title, estimated_minutes: s.estimated_minutes ?? 15,
    priority: prio, scheduled_day: day, queue_position: i,
  }))).select("id,title,status,estimated_minutes");
  if (e2) throw new Error(e2.message);
  return { parent: p, subtasks: data ?? [], total_minutes: total };
}

/**
 * Replaneja o restante do dia. Quem chama (IA) decide ordem/prioridade/
 * duração/novos itens; os horários são calculados pelo motor determinístico,
 * sem sobrepor eventos do Google Calendar. Aplica direto no banco.
 */
export async function replanDay(
  sb: Sb, userId: string,
  a: { day: string; now_minute: number; tz: number; instruction: ReplanInstruction },
) {
  const sched = await getDaySchedule(sb, a.day, a.tz);
  const pending = sched.tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
  const plan = buildTextReplan(
    pending.map((t) => ({ id: t.id, title: t.title, duration: t.duration, priority: t.priority, startMinute: t.start ? parseTime(t.start) : null })),
    sched.blocks,
    a.instruction,
    { fromMinute: Math.max(7 * 60, a.now_minute), afterHours: 18 * 60 },
  );
  const ops: PromiseLike<{ error: { message: string } | null }>[] = [];
  for (const p of plan.placements) {
    const fields = {
      scheduled_day: a.day, is_inbox: false, estimated_minutes: p.duration, priority: p.priority,
      scheduled_start: stamp(a.day, p.start, a.tz),
      scheduled_end: stamp(a.day, Math.min(1439, p.start + p.duration), a.tz),
    };
    ops.push(p.isNew
      ? sb.from("tasks").insert({ ...fields, title: p.title, user_id: userId })
      : sb.from("tasks").update(fields).eq("id", p.id));
  }
  const doneIds = plan.done.map((d) => d.id);
  const tomorrowIds = [...plan.tomorrow, ...plan.overflow].map((d) => d.id).filter((id) => !id.startsWith("new:"));
  if (doneIds.length) ops.push(sb.from("tasks").update({ status: "done", completed_at: new Date().toISOString() }).in("id", doneIds));
  if (tomorrowIds.length) ops.push(sb.from("tasks").update({ scheduled_day: addDay(a.day), scheduled_start: null, scheduled_end: null }).in("id", tomorrowIds));
  const results = await Promise.all(ops);
  const err = results.find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  return {
    schedule: plan.placements.map((p) => ({
      title: p.title, start: hhmm(p.start), end: hhmm(Math.min(1439, p.start + p.duration)),
      previous: p.previousStart != null ? hhmm(p.previousStart) : null, new: p.isNew, after_18h: p.afterHours,
    })),
    done: plan.done.map((d) => d.title),
    moved_to_tomorrow: [...plan.tomorrow, ...plan.overflow].map((d) => d.title),
  };
}
