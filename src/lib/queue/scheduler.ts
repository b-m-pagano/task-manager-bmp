/**
 * Motor de reagendamento puro. Sem I/O.
 * Recebe tarefas (ordem) + eventos (bloqueios) + config e retorna
 * tarefas com scheduled_start/end calculados e flag afterHours.
 */

export type SchedulerTask = {
  id: string;
  estimated_minutes: number;
  queue_position: number;
  pinned_at: string | null;
  status: "pending" | "in_progress" | "done" | "skipped";
};

export type SchedulerEvent = {
  id: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
};

export type SchedulerConfig = {
  day_start_minute: number; // minutes from midnight
  after_hours_minute: number;
  buffer_minutes: number;
};

export type ScheduledTask = SchedulerTask & {
  scheduled_start: string;
  scheduled_end: string;
  afterHours: boolean;
};

/** Day is a JS Date at local midnight (or any ts within that day). */
export function scheduleDay(
  day: Date,
  tasks: SchedulerTask[],
  events: SchedulerEvent[],
  config: SchedulerConfig,
): ScheduledTask[] {
  const base = startOfLocalDay(day);
  const dayStartMs = base.getTime() + config.day_start_minute * 60_000;
  const afterHoursMs = base.getTime() + config.after_hours_minute * 60_000;
  const bufferMs = config.buffer_minutes * 60_000;

  // Filter & sort full-day blocks
  const blockers = events
    .filter((e) => !e.all_day)
    .map((e) => ({
      start: new Date(e.starts_at).getTime(),
      end: new Date(e.ends_at).getTime(),
    }))
    .sort((a, b) => a.start - b.start);

  // Skip "done" tasks but keep them in the output unchanged in time fields.
  const active = tasks
    .slice()
    .sort((a, b) => a.queue_position - b.queue_position);

  const out: ScheduledTask[] = [];
  let cursor = dayStartMs;

  for (const t of active) {
    const duration = t.estimated_minutes * 60_000;

    let start: number;
    if (t.pinned_at) {
      const pinned = new Date(t.pinned_at).getTime();
      start = Math.max(pinned, cursor);
    } else {
      start = cursor;
    }

    // Push past blockers
    start = nextFreeSlot(start, duration, blockers);
    const end = start + duration;

    out.push({
      ...t,
      scheduled_start: new Date(start).toISOString(),
      scheduled_end: new Date(end).toISOString(),
      afterHours: end > afterHoursMs,
    });

    cursor = end + bufferMs;
  }

  return out;
}

function nextFreeSlot(
  desiredStart: number,
  duration: number,
  blockers: { start: number; end: number }[],
): number {
  let start = desiredStart;
  // Iterate until no blocker collides
  // (blockers sorted by start)
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i];
    const end = start + duration;
    if (end <= b.start || start >= b.end) continue;
    // collision → push to end of blocker
    start = b.end;
  }
  return start;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Convenience: group tasks by scheduled_day (YYYY-MM-DD) and schedule each. */
export function scheduleWeek(
  daysISO: string[], // ['2026-05-17', ...]
  tasksByDay: Record<string, SchedulerTask[]>,
  eventsByDay: Record<string, SchedulerEvent[]>,
  config: SchedulerConfig,
): Record<string, ScheduledTask[]> {
  const result: Record<string, ScheduledTask[]> = {};
  for (const iso of daysISO) {
    const [y, m, d] = iso.split("-").map(Number);
    result[iso] = scheduleDay(
      new Date(y, m - 1, d),
      tasksByDay[iso] ?? [],
      eventsByDay[iso] ?? [],
      config,
    );
  }
  return result;
}
