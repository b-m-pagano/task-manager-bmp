/**
 * Reflow engine — pure, no I/O.
 *
 * Given a set of tasks for a single day, a set of blocking events (calendar
 * busy intervals), and a "moved" task placed at a target start minute, return
 * the new start minute for every task such that:
 *
 *  - The moved task occupies exactly the target slot (after being nudged past
 *    any blocking event if needed).
 *  - No task overlaps any blocking event.
 *  - No task overlaps another task.
 *  - The relative order of the other tasks (by their original start time) is
 *    preserved — they get pushed forward in time as needed.
 *
 * Times are integer minutes from 00:00. Snap policy (e.g. 15-min grid) is
 * the caller's responsibility — pass already-snapped values in.
 */

export interface ReflowTask {
  id: string;
  start: number;
  duration: number;
}

export interface ReflowBlock {
  start: number;
  end: number;
}

export interface ReflowOptions {
  /** Minimum minute a task may start at (e.g. day_start_minute). */
  dayStart?: number;
  /** Buffer minutes inserted between consecutive tasks. */
  buffer?: number;
}

export interface ReflowResult {
  /** Map of task id → new start minute. Only contains tasks that moved. */
  changes: Record<string, number>;
}

/**
 * Place an item starting at `desiredStart` for `duration` minutes, skipping
 * past any blocker that overlaps. Returns the chosen start minute.
 */
function fitPast(
  desiredStart: number,
  duration: number,
  blockers: ReflowBlock[],
): number {
  let start = desiredStart;
  // Iterate until stable (a push past one blocker may collide with the next).
  let safety = blockers.length + 2;
  while (safety-- > 0) {
    let pushed = false;
    for (const b of blockers) {
      const end = start + duration;
      if (end <= b.start || start >= b.end) continue;
      start = b.end;
      pushed = true;
    }
    if (!pushed) break;
  }
  return start;
}

/**
 * Core reflow.
 *
 * @param tasks   All tasks on the day (including the moved one). Their `start`
 *                represents the CURRENT/original placement — used only to
 *                derive relative order for the non-moved items.
 * @param events  Blocking events (busy intervals).
 * @param movedId Id of the task the user just placed.
 * @param target  New target start minute for the moved task (pre-snapped).
 */
export function reflowDay(
  tasks: ReflowTask[],
  events: ReflowBlock[],
  movedId: string,
  target: number,
  options: ReflowOptions = {},
): ReflowResult {
  const dayStart = options.dayStart ?? 0;
  const buffer = Math.max(0, options.buffer ?? 0);

  const moved = tasks.find((t) => t.id === movedId);
  if (!moved) return { changes: {} };

  const sortedBlockers = events
    .filter((e) => e.end > e.start)
    .map((e) => ({ start: e.start, end: e.end }))
    .sort((a, b) => a.start - b.start);

  // 1. Place the moved task, nudging past blockers.
  const movedStart = fitPast(Math.max(dayStart, target), moved.duration, sortedBlockers);
  const movedEnd = movedStart + moved.duration;

  // 2. Build the "occupied" set: blockers + moved task. Other tasks must dodge these.
  const occupied: ReflowBlock[] = [
    ...sortedBlockers,
    { start: movedStart, end: movedEnd + buffer },
  ].sort((a, b) => a.start - b.start);

  // 3. Sort other tasks by their original start (stable on id for ties).
  const others = tasks
    .filter((t) => t.id !== movedId)
    .slice()
    .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));

  const changes: Record<string, number> = {};
  if (movedStart !== moved.start) changes[movedId] = movedStart;

  // 4. Sweep: each task gets placed at the earliest free slot ≥ its original
  //    start. As we place tasks, they extend the occupied set so later tasks
  //    in original order can't slip in front of them.
  for (const t of others) {
    const desired = Math.max(dayStart, t.start);
    const placed = fitPast(desired, t.duration, occupied);
    if (placed !== t.start) changes[t.id] = placed;
    occupied.push({ start: placed, end: placed + t.duration + buffer });
    occupied.sort((a, b) => a.start - b.start);
  }

  return { changes };
}
