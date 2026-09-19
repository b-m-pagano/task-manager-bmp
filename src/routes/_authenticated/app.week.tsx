import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { z } from "zod";

import { WeekHeader } from "@/components/week-calendar/week-header";
import { WeekToolbar } from "@/components/week-calendar/week-toolbar";
import { WeekDayColumn } from "@/components/week-calendar/week-day-column";
import {
  GRID_HEIGHT,
  HourGutter,
  PX_PER_HOUR,
  WORK_START_HOUR,
} from "@/components/week-calendar/time-grid";
import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import { useWeekBoard, type RawTask } from "@/components/week-calendar/use-week-board";
import { useWeekScheduling } from "@/components/week-calendar/use-week-scheduling";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/_authenticated/app/week")({
  component: WeekPage,
  head: () => ({ meta: [{ title: "Semana — FocusQueue" }] }),
  validateSearch: (search) =>
    z.object({ day: z.string().regex(ISO_DATE).optional() }).parse(search),
});

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function WeekPage() {
  const { day: daySearch } = Route.useSearch();
  const initial = useMemo(() => {
    if (daySearch) {
      const [y, m, d] = daySearch.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [daySearch]);
  const [selected, setSelected] = useState(initial);
  const [cursor, setCursor] = useState(initial);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);
  const [createDay, setCreateDay] = useState<string>(isoDay(new Date()));

  const weekStart = useMemo(() => startOfWeek(selected, { weekStartsOn: 1 }), [selected]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const daysISO = useMemo(() => days.map(isoDay), [days]);

  const board = useWeekBoard(daysISO);
  const {
    data,
    isLoading,
    categories,
    projects,
    categoryById,
    projectById,
    toggleStatusMut,
    carryMut,
  } = board;
  const { handleDrop, handleSynced, replanDay, applySuggestion } = useWeekScheduling(
    board,
    daysISO,
  );

  const columnRefs = useRef<Record<string, HTMLElement | null>>({});

  const openCreate = useCallback((day?: string) => {
    setEditing(null);
    setCreateDay(day ?? isoDay(new Date()));
    setDialogOpen(true);
  }, []);

  const openEditById = useCallback(
    (id: string) => {
      const t = (data?.tasks ?? []).find((x) => x.id === id) as RawTask | undefined;
      if (!t) return;
      setEditing({
        id: t.id,
        title: t.title,
        description: t.description,
        notes: t.notes,
        estimated_minutes: t.estimated_minutes,
        priority: t.priority,
        status: t.status,
        category_id: t.category_id,
        project_id: t.project_id,
        scheduled_day: t.scheduled_day,
        scheduled_start: t.scheduled_start,
        due_date: t.due_date,
        parent_id: t.parent_id,
      });
      setDialogOpen(true);
    },
    [data],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (inField) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreate();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        window.location.href = "/app/inbox";
      } else if (e.key === "/") {
        e.preventDefault();
        document.getElementById("quick-add-input")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCreate]);

  // Auto-scroll on mount
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const target = Math.max(0, (minutes - WORK_START_HOUR * 60 - 60) * (PX_PER_HOUR / 60));
    scrollRef.current.scrollTop = target;
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WeekHeader
        weekStart={weekStart}
        weekEnd={days[6]}
        onPrev={() => setSelected((d) => addDays(d, -7))}
        onNext={() => setSelected((d) => addDays(d, 7))}
        onToday={() => {
          setSelected(new Date());
          setCursor(new Date());
        }}
      />

      <WeekToolbar
        onOpenCreate={() => openCreate()}
        selected={selected}
        onSelectDate={setSelected}
        cursor={cursor}
        onCursorChange={setCursor}
        categories={categories}
        onReplanDay={replanDay}
        carryMut={carryMut}
        daysISO={daysISO}
        onSynced={handleSynced}
        onApplySuggestion={applySuggestion}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex border-b border-border bg-background/85 backdrop-blur">
            <div className="w-16 shrink-0" />
            {days.map((d) => {
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={d.toISOString()}
                  className="flex flex-1 flex-col items-center gap-0.5 border-r border-border py-2 last:border-r-0"
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {format(d, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          <div ref={scrollRef} className="relative flex-1 overflow-auto">
            <div className="flex" style={{ minHeight: GRID_HEIGHT }}>
              <HourGutter />
              {days.map((d, dayIdx) => (
                <WeekDayColumn
                  key={daysISO[dayIdx]}
                  day={d}
                  iso={daysISO[dayIdx]}
                  tasks={(data?.tasks ?? []) as RawTask[]}
                  events={data?.events ?? []}
                  categoryById={categoryById}
                  projectById={projectById}
                  columnRefs={columnRefs}
                  onCreateHere={() => openCreate(daysISO[dayIdx])}
                  onOpenTask={openEditById}
                  onDrop={handleDrop}
                  toggleStatusMut={toggleStatusMut}
                />
              ))}
            </div>
            {isLoading && (
              <div className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs text-muted-foreground">
                Carregando…
              </div>
            )}
          </div>
        </div>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultDay={createDay}
        categories={categories}
        projects={projects}
        onOpenSubtask={(id) => openEditById(id)}
      />
    </div>
  );
}
