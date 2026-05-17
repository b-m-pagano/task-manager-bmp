import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { WeekHeader } from "@/components/week-calendar/week-header";
import { MiniCalendar } from "@/components/week-calendar/mini-calendar";
import {
  DayColumnGrid,
  GRID_HEIGHT,
  HourGutter,
  PX_PER_HOUR,
  DAY_START_HOUR,
} from "@/components/week-calendar/time-grid";
import { EventCard } from "@/components/week-calendar/event-card";
import { CurrentTimeIndicator } from "@/components/week-calendar/current-time-indicator";
import { DraggableTask } from "@/components/week-calendar/draggable-task";
import { QuickAddBar } from "@/components/tasks/quick-add-bar";
import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import { listWeekData, rescheduleTasks } from "@/lib/tasks.functions";
import { reflowDay, type ReflowBlock, type ReflowTask } from "@/lib/queue/reflow";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/week")({
  component: WeekPage,
  head: () => ({ meta: [{ title: "Semana — FocusQueue" }] }),
});

interface RawTask {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  estimated_minutes: number;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "done" | "skipped";
  category_id: string | null;
  project_id: string | null;
  scheduled_day: string;
  scheduled_start: string | null;
  due_date: string | null;
  parent_id: string | null;
}

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}
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

function WeekPage() {
  const [selected, setSelected] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);
  const [createDay, setCreateDay] = useState<string>(isoDay(new Date()));

  const weekStart = useMemo(() => startOfWeek(selected, { weekStartsOn: 1 }), [selected]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const daysISO = useMemo(() => days.map(isoDay), [days]);

  const listFn = useServerFn(listWeekData);
  const { data, isLoading } = useQuery({
    queryKey: ["week", daysISO[0]],
    queryFn: () => listFn({ data: { days: daysISO } }),
  });

  const categories = (data?.categories ?? []) as { id: string; name: string; color: string }[];
  const projects = (data?.projects ?? []) as { id: string; name: string; color: string }[];
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const projectById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  );

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

  // Global shortcuts: N=new, /=focus quick add
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inField) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openCreate();
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
    const target = Math.max(0, (minutes - DAY_START_HOUR * 60 - 60) * (PX_PER_HOUR / 60));
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

      <div className="flex items-center gap-3 border-b border-border px-6 py-2">
        <Button size="sm" onClick={() => openCreate()} className="shrink-0">
          <Plus className="mr-1 h-3.5 w-3.5" /> Nova tarefa
          <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">N</span>
        </Button>
        <div className="flex-1">
          <QuickAddBar todayISO={isoDay(new Date())} />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
          <MiniCalendar
            selected={selected}
            onSelect={setSelected}
            cursor={cursor}
            onCursorChange={setCursor}
          />
          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categorias
            </p>
            <ul className="space-y-1.5">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-foreground">{c.name}</span>
                </li>
              ))}
              {categories.length === 0 && (
                <li className="text-xs text-muted-foreground">Nenhuma ainda</li>
              )}
            </ul>
          </div>
        </aside>

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
              {days.map((d, dayIdx) => {
                const iso = daysISO[dayIdx];
                const isToday = isSameDay(d, new Date());
                const dayWeekday = d.getDay();
                const isWeekend = dayWeekday === 0 || dayWeekday === 6;
                const dayTasks = (data?.tasks ?? []).filter(
                  (t) => (t as RawTask).scheduled_day === iso && !(t as RawTask).parent_id,
                ) as RawTask[];
                const dayEvents = (data?.events ?? []).filter(
                  (e: any) => (e.starts_at ?? "").slice(0, 10) === iso,
                );

                let stack = DAY_START_HOUR * 60; // for tasks without a time
                return (
                  <DayColumnGrid key={iso} isToday={isToday} isWeekend={isWeekend}>
                    {/* Click empty area → quick create on that day */}
                    <button
                      type="button"
                      onClick={() => openCreate(iso)}
                      className="absolute inset-0 cursor-cell"
                      aria-label={`Adicionar tarefa em ${iso}`}
                    />
                    {dayEvents.map((e: any) => {
                      const startD = new Date(e.starts_at);
                      const endD = new Date(e.ends_at);
                      const dur = Math.max(
                        15,
                        Math.round((endD.getTime() - startD.getTime()) / 60000),
                      );
                      const startMin = startD.getHours() * 60 + startD.getMinutes();
                      return (
                        <EventCard
                          key={e.id}
                          event={{
                            id: e.id,
                            title: e.title,
                            day: iso,
                            startMinute: startMin,
                            durationMinutes: dur,
                            categoryId: "",
                            status: "pending",
                            priority: "medium",
                            external: true,
                          }}
                        />
                      );
                    })}
                    {dayTasks.map((t) => {
                      const startMin = tsToMinute(t.scheduled_start, stack);
                      if (!t.scheduled_start) stack = startMin + t.estimated_minutes;
                      const cat = t.category_id ? categoryById[t.category_id] : undefined;
                      const proj = t.project_id ? projectById[t.project_id] : undefined;
                      return (
                        <div
                          key={t.id}
                          className="relative z-[1]"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditById(t.id);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") openEditById(t.id);
                          }}
                        >
                          <EventCard
                            event={{
                              id: t.id,
                              title: t.title,
                              day: iso,
                              startMinute: startMin,
                              durationMinutes: t.estimated_minutes,
                              categoryId: t.category_id ?? "",
                              projectId: t.project_id ?? undefined,
                              status: mapStatusForCard(t.status),
                              priority: t.priority,
                            }}
                            category={cat}
                            project={proj}
                          />
                        </div>
                      );
                    })}
                    {isToday && <CurrentTimeIndicator />}
                  </DayColumnGrid>
                );
              })}
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
