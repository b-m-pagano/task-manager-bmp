import type { MutableRefObject } from "react";
import { isSameDay } from "date-fns";
import { DayColumnGrid, WORK_START_HOUR } from "./time-grid";
import { EventCard } from "./event-card";
import { CurrentTimeIndicator } from "./current-time-indicator";
import { DraggableTask } from "./draggable-task";
import type { RawTask, WeekBoard } from "./use-week-board";

type WeekData = NonNullable<WeekBoard["data"]>;
type CalendarEventRow = WeekData["events"][number];

function tsToMinute(ts: string | null, fallback: number): number {
  if (!ts) return fallback;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}
function mapStatusForCard(s: RawTask["status"]): "pending" | "doing" | "done" {
  if (s === "done") return "done";
  if (s === "in_progress") return "doing";
  return "pending";
}

type Item =
  | { kind: "task"; task: RawTask; start: number; duration: number }
  | { kind: "event"; event: CalendarEventRow; start: number; duration: number };

interface WeekDayColumnProps {
  day: Date;
  iso: string;
  tasks: RawTask[];
  events: CalendarEventRow[];
  categoryById: WeekBoard["categoryById"];
  projectById: WeekBoard["projectById"];
  columnRefs: MutableRefObject<Record<string, HTMLElement | null>>;
  onCreateHere: () => void;
  onOpenTask: (id: string) => void;
  onDrop: (taskId: string, drop: { day: string; startMinute: number }) => void;
  toggleStatusMut: WeekBoard["toggleStatusMut"];
}

/**
 * Renders one day's column: computes start/duration for tasks + external
 * events, assigns overlap lanes (sweep + transitive clustering), and
 * renders the resulting cards.
 */
export function WeekDayColumn({
  day,
  iso,
  tasks,
  events,
  categoryById,
  projectById,
  columnRefs,
  onCreateHere,
  onOpenTask,
  onDrop,
  toggleStatusMut,
}: WeekDayColumnProps) {
  const isToday = isSameDay(day, new Date());
  const dayWeekday = day.getDay();
  const isWeekend = dayWeekday === 0 || dayWeekday === 6;

  const dayTasks = tasks.filter((t) => t.scheduled_day === iso && !t.parent_id);
  const dayEvents = events.filter((e) => !e.all_day && (e.starts_at ?? "").slice(0, 10) === iso);

  // Compute start/duration for each item (tasks + external events),
  // then assign lanes for overlapping items.
  let stack = WORK_START_HOUR * 60;
  const items: Item[] = [];
  for (const t of dayTasks) {
    const startMin = tsToMinute(t.scheduled_start, stack);
    if (!t.scheduled_start) stack = startMin + t.estimated_minutes;
    items.push({
      kind: "task",
      task: t,
      start: startMin,
      duration: t.estimated_minutes,
    });
  }
  for (const e of dayEvents) {
    const startD = new Date(e.starts_at);
    const endD = new Date(e.ends_at);
    const startMin = startD.getHours() * 60 + startD.getMinutes();
    const rawDur = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
    const dur = Math.min(rawDur, 24 * 60 - startMin);
    items.push({
      kind: "event",
      event: e,
      start: startMin,
      duration: dur,
    });
  }
  // Sort by start asc, longer first to keep stable lane assignment.
  items.sort((a, b) => a.start - b.start || b.duration - a.duration);

  // Sweep lanes: each lane keeps its current end minute.
  const laneEnds: number[] = [];
  const itemLane = new Map<Item, number>();
  for (const it of items) {
    let placed = -1;
    for (let i = 0; i < laneEnds.length; i++) {
      if (laneEnds[i] <= it.start) {
        placed = i;
        break;
      }
    }
    if (placed === -1) {
      placed = laneEnds.length;
      laneEnds.push(0);
    }
    laneEnds[placed] = it.start + it.duration;
    itemLane.set(it, placed);
  }
  // Cluster lane counts: items that overlap transitively share laneCount.
  const sortedByStart = [...items].sort((a, b) => a.start - b.start);
  const clusterCount = new Map<Item, number>();
  let cluster: Item[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const maxLane = cluster.reduce((m, x) => Math.max(m, itemLane.get(x) ?? 0), 0);
    const count = maxLane + 1;
    for (const x of cluster) clusterCount.set(x, count);
    cluster = [];
    clusterEnd = -1;
  };
  for (const it of sortedByStart) {
    if (cluster.length === 0 || it.start < clusterEnd) {
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.start + it.duration);
    } else {
      flush();
      cluster.push(it);
      clusterEnd = it.start + it.duration;
    }
  }
  flush();

  return (
    <DayColumnGrid
      isToday={isToday}
      isWeekend={isWeekend}
      ref={(el) => {
        columnRefs.current[iso] = el;
      }}
    >
      {/* Click empty area → quick create on that day */}
      <button
        type="button"
        onClick={onCreateHere}
        className="absolute inset-0 cursor-cell"
        aria-label={`Adicionar tarefa em ${iso}`}
      />
      {items.map((it) => {
        const laneIndex = itemLane.get(it) ?? 0;
        const laneCount = clusterCount.get(it) ?? 1;
        if (it.kind === "event") {
          const e = it.event;
          return (
            <EventCard
              key={e.id}
              event={{
                id: e.id,
                title: e.title,
                day: iso,
                startMinute: it.start,
                durationMinutes: it.duration,
                categoryId: "",
                status: "pending",
                priority: "medium",
                external: true,
              }}
              laneIndex={laneIndex}
              laneCount={laneCount}
            />
          );
        }
        const t = it.task;
        const cat = t.category_id ? categoryById[t.category_id] : undefined;
        const proj = t.project_id ? projectById[t.project_id] : undefined;
        return (
          <DraggableTask
            key={t.id}
            event={{
              id: t.id,
              title: t.title,
              day: iso,
              startMinute: it.start,
              durationMinutes: t.estimated_minutes,
              categoryId: t.category_id ?? "",
              projectId: t.project_id ?? undefined,
              status: mapStatusForCard(t.status),
              priority: t.priority,
            }}
            category={cat}
            project={proj}
            columnRefs={columnRefs}
            laneIndex={laneIndex}
            laneCount={laneCount}
            onClick={() => onOpenTask(t.id)}
            onDrop={(d) => onDrop(t.id, d)}
            onToggleStatus={() =>
              toggleStatusMut.mutate({
                id: t.id,
                status: t.status === "done" ? "pending" : "done",
              })
            }
            isTogglingStatus={toggleStatusMut.isPending && toggleStatusMut.variables?.id === t.id}
          />
        );
      })}
      {isToday && <CurrentTimeIndicator />}
    </DayColumnGrid>
  );
}
