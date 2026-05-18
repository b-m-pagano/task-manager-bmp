import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { Plus, Sparkles, ArrowDownToLine, CalendarDays, Tags } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { WeekHeader } from "@/components/week-calendar/week-header";
import { MiniCalendar } from "@/components/week-calendar/mini-calendar";
import {
  DayColumnGrid,
  GRID_HEIGHT,
  HourGutter,
  PX_PER_HOUR,
  WORK_START_HOUR,
} from "@/components/week-calendar/time-grid";
import { EventCard } from "@/components/week-calendar/event-card";
import { CurrentTimeIndicator } from "@/components/week-calendar/current-time-indicator";
import { DraggableTask } from "@/components/week-calendar/draggable-task";
import { CalendarSyncButton } from "@/components/week-calendar/calendar-sync-button";
import { AiInsightsPanel } from "@/components/week-calendar/ai-insights-panel";
import { QuickAddBar } from "@/components/tasks/quick-add-bar";
import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { carryUnfinished, listWeekData, rescheduleTasks } from "@/lib/tasks.functions";
import { reflowConflicts, reflowDay, type ReflowBlock, type ReflowTask } from "@/lib/queue/reflow";
import { autoScheduleDay, type AutoTask, type AutoBlock } from "@/lib/queue/auto-schedule";
import { cn } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const Route = createFileRoute("/_authenticated/app/week")({
  component: WeekPage,
  head: () => ({ meta: [{ title: "Semana — FocusQueue" }] }),
  validateSearch: (search) =>
    z
      .object({ day: z.string().regex(ISO_DATE).optional() })
      .parse(search),
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

  const listFn = useServerFn(listWeekData);
  const rescheduleFn = useServerFn(rescheduleTasks);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["week", daysISO[0]],
    queryFn: () => listFn({ data: { days: daysISO } }),
  });

  const columnRefs = useRef<Record<string, HTMLElement | null>>({});

  const rescheduleMut = useMutation({
    mutationFn: (updates: { id: string; scheduled_day: string; start_minute: number }[]) =>
      rescheduleFn({ data: { updates } }),
    onError: () => {
      toast.error("Não foi possível reagendar");
      qc.invalidateQueries({ queryKey: ["week"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week"] }),
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

  // Intelligent drop handler — uses reflow engine and persists via bulk reschedule.
  const handleDrop = useCallback(
    (taskId: string, drop: { day: string; startMinute: number }) => {
      const all = (data?.tasks ?? []) as RawTask[];
      const moved = all.find((t) => t.id === taskId);
      if (!moved) return;

      // If moving across days, just place the moved task — same-day reflow only
      // affects tasks in the target day.
      const oldDay = moved.scheduled_day;
      const targetDay = drop.day;

      // Build target-day task set (after virtually moving `moved` into it).
      const targetTasksRaw = all.filter(
        (t) => (t.scheduled_day === targetDay || t.id === taskId) && !t.parent_id,
      );
      const targetEvents: ReflowBlock[] = (data?.events ?? [])
        .filter((e: any) => (e.starts_at ?? "").slice(0, 10) === targetDay)
        .map((e: any) => {
          const s = new Date(e.starts_at);
          const en = new Date(e.ends_at);
          return {
            start: s.getHours() * 60 + s.getMinutes(),
            end: en.getHours() * 60 + en.getMinutes(),
          };
        });

      let stack = WORK_START_HOUR * 60;
      const targetTasks: ReflowTask[] = targetTasksRaw.map((t) => {
        const start =
          t.id === taskId
            ? drop.startMinute
            : t.scheduled_start
              ? tsToMinute(t.scheduled_start, stack)
              : stack;
        if (t.id !== taskId && !t.scheduled_start) stack = start + t.estimated_minutes;
        return { id: t.id, start, duration: t.estimated_minutes };
      });

      const { changes } = reflowDay(targetTasks, targetEvents, taskId, drop.startMinute, {
        dayStart: WORK_START_HOUR * 60,
        buffer: 0,
      });

      // Always include the moved task even if its minute didn't change (day may have).
      changes[taskId] = changes[taskId] ?? drop.startMinute;

      const updates = Object.entries(changes).map(([id, startMinute]) => ({
        id,
        scheduled_day: targetDay,
        start_minute: startMinute,
      }));

      // Optimistic patch of cached week data.
      qc.setQueryData(["week", daysISO[0]], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t: RawTask) => {
            const upd = updates.find((u) => u.id === t.id);
            if (!upd) return t;
            const h = String(Math.floor(upd.start_minute / 60)).padStart(2, "0");
            const m = String(upd.start_minute % 60).padStart(2, "0");
            return {
              ...t,
              scheduled_day: upd.scheduled_day,
              scheduled_start: `${upd.scheduled_day}T${h}:${m}:00`,
            };
          }),
        };
      });

      rescheduleMut.mutate(updates);
      const endMinute = drop.startMinute + moved.estimated_minutes;
      const AFTER = 18 * 60;
      if (drop.startMinute >= AFTER) {
        toast.warning("Tarefa começa após 18h", {
          description: "Fora do horário comercial",
        });
      } else if (endMinute > AFTER) {
        toast.warning("Tarefa termina após 18h", {
          description: `Ultrapassa em ${endMinute - AFTER} min`,
        });
      }
      if (oldDay !== targetDay) {
        toast.success("Tarefa movida", { description: `→ ${targetDay}` });
      }
    },
    [data, daysISO, qc, rescheduleMut],
  );

  /**
   * Após sincronizar Google Calendar: detecta tarefas que passaram a colidir
   * com eventos externos e empurra-as para o próximo espaço livre, mantendo
   * ordem relativa. Eventos externos têm prioridade absoluta.
   */
  const handleSynced = useCallback(async () => {
    const fresh = await qc.fetchQuery({
      queryKey: ["week", daysISO[0]],
      queryFn: () => listFn({ data: { days: daysISO } }),
    });
    const allUpdates: { id: string; scheduled_day: string; start_minute: number }[] = [];
    for (const iso of daysISO) {
      const dayTasks = (fresh.tasks as RawTask[]).filter(
        (t) => t.scheduled_day === iso && !t.parent_id,
      );
      if (dayTasks.length === 0) continue;
      const dayEvents: ReflowBlock[] = (fresh.events ?? [])
        .filter((e: any) => (e.starts_at ?? "").slice(0, 10) === iso)
        .map((e: any) => {
          const s = new Date(e.starts_at);
          const en = new Date(e.ends_at);
          return {
            start: s.getHours() * 60 + s.getMinutes(),
            end: en.getHours() * 60 + en.getMinutes(),
          };
        });
      if (dayEvents.length === 0) continue;
      let stack = WORK_START_HOUR * 60;
      const rTasks: ReflowTask[] = dayTasks.map((t) => {
        const start = t.scheduled_start ? tsToMinute(t.scheduled_start, stack) : stack;
        if (!t.scheduled_start) stack = start + t.estimated_minutes;
        return { id: t.id, start, duration: t.estimated_minutes };
      });
      const { changes } = reflowConflicts(rTasks, dayEvents, {
        dayStart: WORK_START_HOUR * 60,
        buffer: 0,
      });
      for (const [id, startMinute] of Object.entries(changes)) {
        allUpdates.push({ id, scheduled_day: iso, start_minute: startMinute });
      }
    }
    if (allUpdates.length > 0) {
      rescheduleMut.mutate(allUpdates);
      toast.message("Tarefas reagendadas", {
        description: `${allUpdates.length} tarefa(s) movida(s) por conflito com Calendar`,
      });
    }
  }, [daysISO, listFn, qc, rescheduleMut]);

  /**
   * Replaneja completamente um dia usando o motor de auto-agendamento.
   * Hierarquia: eventos > pinned > urgent > high > medium > low.
   * Mantém continuidade (sem espaços mortos), respeita duração.
   */
  const replanDay = useCallback(
    (iso: string) => {
      const all = (data?.tasks ?? []) as RawTask[];
      const dayTasks = all.filter((t) => t.scheduled_day === iso && !t.parent_id);
      if (dayTasks.length === 0) {
        toast.info("Nada para replanejar nesse dia");
        return;
      }
      const dayEvents: AutoBlock[] = ((data?.events ?? []) as any[])
        .filter((e) => (e.starts_at ?? "").slice(0, 10) === iso)
        .map((e) => {
          const s = new Date(e.starts_at);
          const en = new Date(e.ends_at);
          return {
            start: s.getHours() * 60 + s.getMinutes(),
            end: en.getHours() * 60 + en.getMinutes(),
          };
        });

      const autoTasks: AutoTask[] = dayTasks.map((t, idx) => ({
        id: t.id,
        duration: t.estimated_minutes,
        priority: t.priority,
        status: t.status,
        order: t.scheduled_start ? tsToMinute(t.scheduled_start, idx) : idx,
      }));

      const { placements, changes } = autoScheduleDay(autoTasks, dayEvents, {
        dayStart: WORK_START_HOUR * 60,
        afterHoursMinute: 18 * 60,
        buffer: 0,
      });

      if (changes.length === 0) {
        toast.info("Dia já está otimizado");
        return;
      }
      const updates = placements.map((p) => ({
        id: p.id,
        scheduled_day: iso,
        start_minute: p.start,
      }));

      qc.setQueryData(["week", daysISO[0]], (prev: any) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t: RawTask) => {
            const upd = updates.find((u) => u.id === t.id);
            if (!upd) return t;
            const h = String(Math.floor(upd.start_minute / 60)).padStart(2, "0");
            const m = String(upd.start_minute % 60).padStart(2, "0");
            return {
              ...t,
              scheduled_day: upd.scheduled_day,
              scheduled_start: `${upd.scheduled_day}T${h}:${m}:00`,
            };
          }),
        };
      });
      rescheduleMut.mutate(updates);

      const afterHoursCount = placements.filter((p) => p.afterHours).length;
      toast.success(`${changes.length} tarefa(s) replanejada(s)`, {
        description:
          afterHoursCount > 0
            ? `${afterHoursCount} ultrapassa(m) 18h`
            : "Sequência otimizada",
      });
    },
    [data, daysISO, qc, rescheduleMut],
  );

  const carryFn = useServerFn(carryUnfinished);
  const carryMut = useMutation({
    mutationFn: () => carryFn(),
    onSuccess: (res: { moved: number }) => {
      qc.invalidateQueries({ queryKey: ["week"] });
      if (res.moved > 0) {
        toast.success(`${res.moved} tarefa(s) migrada(s) para hoje`, {
          description: "Marcadas como prioridade máxima",
        });
      } else {
        toast.info("Nenhuma tarefa pendente de dias anteriores");
      }
    },
    onError: () => toast.error("Não foi possível migrar tarefas"),
  });

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

      <div className="flex items-center gap-3 border-b border-border px-6 py-2">
        <Button size="sm" onClick={() => openCreate()} className="shrink-0">
          <Plus className="mr-1 h-3.5 w-3.5" /> Nova tarefa
          <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">N</span>
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="shrink-0" title="Escolher data">
              <CalendarDays className="mr-1 h-3.5 w-3.5" />
              <span className="hidden sm:inline">{format(selected, "d MMM")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[260px] p-0">
            <MiniCalendar
              selected={selected}
              onSelect={setSelected}
              cursor={cursor}
              onCursorChange={setCursor}
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0"
              title="Legenda de categorias"
            >
              <Tags className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-3">
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
          </PopoverContent>
        </Popover>
        <div className="flex-1">
          <QuickAddBar todayISO={isoDay(new Date())} />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => replanDay(isoDay(selected))}
          className="shrink-0"
          title="Replanejar dia selecionado"
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" /> Replanejar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => carryMut.mutate()}
          disabled={carryMut.isPending}
          className="shrink-0"
          title="Migrar tarefas pendentes para hoje"
        >
          <ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> Migrar pendentes
        </Button>
        <AiInsightsPanel
          day={isoDay(selected)}
          onReplanDay={replanDay}
          onApplySuggestion={(taskId, day, startMinute) => {
            const update = { id: taskId, scheduled_day: day, start_minute: startMinute };
            qc.setQueryData(["week", daysISO[0]], (prev: any) => {
              if (!prev) return prev;
              const h = String(Math.floor(startMinute / 60)).padStart(2, "0");
              const m = String(startMinute % 60).padStart(2, "0");
              return {
                ...prev,
                tasks: prev.tasks.map((t: RawTask) =>
                  t.id === taskId
                    ? { ...t, scheduled_day: day, scheduled_start: `${day}T${h}:${m}:00` }
                    : t,
                ),
              };
            });
            rescheduleMut.mutate([update]);
          }}
        />
        <CalendarSyncButton
          from={daysISO[0]}
          to={daysISO[daysISO.length - 1]}
          onSynced={handleSynced}
        />
      </div>

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

                let stack = WORK_START_HOUR * 60; // for tasks without a time
                return (
                  <DayColumnGrid
                    key={iso}
                    isToday={isToday}
                    isWeekend={isWeekend}
                    ref={(el) => {
                      columnRefs.current[iso] = el;
                    }}
                  >
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
                        <DraggableTask
                          key={t.id}
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
                          columnRefs={columnRefs}
                          onClick={() => openEditById(t.id)}
                          onDrop={(d) => handleDrop(t.id, d)}
                        />
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
