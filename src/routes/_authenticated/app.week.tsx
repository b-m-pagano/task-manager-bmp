import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { addDays, format } from "date-fns";
import { Sparkles, Plus, ChevronLeft, ChevronRight, Moon, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { listWeekData, createTask, updateTask, reorderDay, carryUnfinished } from "@/lib/tasks.functions";
import { quickAddParse } from "@/lib/quick-add.functions";
import { syncCalendarRange } from "@/lib/calendar.functions";
import { scheduleWeek, type SchedulerEvent } from "@/lib/queue/scheduler";
import { weekDays, isoDay, dayLabel } from "@/lib/queue/dates";
import { supabase } from "@/integrations/supabase/client";

// Visual density: pixels per minute. Used to size task/event cards proportionally.
const PX_PER_MIN = 1.6;
const MIN_CARD_PX = 56;

export const Route = createFileRoute("/_authenticated/app/week")({
  component: WeekPage,
  head: () => ({ meta: [{ title: "Semana — FocusQueue" }] }),
});

function WeekPage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const daysISO = useMemo(() => days.map(isoDay), [days]);

  const qc = useQueryClient();
  const listFn = useServerFn(listWeekData);
  const carryFn = useServerFn(carryUnfinished);
  const syncFn = useServerFn(syncCalendarRange);

  useEffect(() => {
    carryFn({ data: undefined as never }).catch(() => {});
  }, [carryFn]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.provider_token;
      if (!token) return;
      syncFn({ data: { provider_token: token, from: daysISO[0], to: daysISO[6] } })
        .then(() => qc.invalidateQueries({ queryKey: ["week"] }))
        .catch(() => {});
    });
  }, [daysISO, syncFn, qc]);

  const { data, isLoading } = useQuery({
    queryKey: ["week", daysISO[0]],
    queryFn: () => listFn({ data: { days: daysISO } }),
  });

  const scheduled = useMemo(() => {
    if (!data) return {};
    const tasksByDay: Record<string, any[]> = {};
    const eventsByDay: Record<string, SchedulerEvent[]> = {};
    for (const iso of daysISO) {
      tasksByDay[iso] = [];
      eventsByDay[iso] = [];
    }
    for (const t of data.tasks) {
      if (tasksByDay[t.scheduled_day]) tasksByDay[t.scheduled_day].push(t);
    }
    for (const e of data.events) {
      const iso = e.starts_at.slice(0, 10);
      if (eventsByDay[iso]) eventsByDay[iso].push(e as any);
    }
    return scheduleWeek(daysISO, tasksByDay as any, eventsByDay, {
      day_start_minute: data.settings.day_start_minute,
      after_hours_minute: data.settings.after_hours_minute,
      buffer_minutes: data.settings.buffer_minutes,
    });
  }, [data, daysISO]);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight">Semana</h1>
        <div className="ml-2 flex items-center gap-1">
          <button
            onClick={() => setAnchor((d) => addDays(d, -7))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Hoje
          </button>
          <button
            onClick={() => setAnchor((d) => addDays(d, 7))}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Próxima semana"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {format(days[0], "d MMM")} – {format(days[6], "d MMM yyyy")}
        </span>
        <div className="ml-auto w-full max-w-md">
          <QuickAddBar todayISO={isoDay(new Date())} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-7 overflow-auto">
        {days.map((day) => {
          const iso = isoDay(day);
          const dayTasks = (data?.tasks ?? []).filter((t) => t.scheduled_day === iso);
          const computed = scheduled[iso] ?? [];
          const events = (data?.events ?? []).filter((e) => e.starts_at.slice(0, 10) === iso);
          return (
            <DayColumn
              key={iso}
              day={day}
              iso={iso}
              tasks={dayTasks as any}
              computed={computed as any}
              events={events as any}
              afterHoursMin={data?.settings.after_hours_minute ?? 1080}
              categories={data?.categories ?? []}
            />
          );
        })}
      </div>
      {isLoading && (
        <div className="pointer-events-none absolute inset-x-0 top-14 flex items-center justify-center text-xs text-muted-foreground">
          Carregando…
        </div>
      )}
    </div>
  );
}

function NowBadge() {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(i);
  }, []);
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-now/15 px-2 py-0.5 text-[10px] font-medium text-now">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-now opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-now" />
      </span>
      agora {format(new Date(), "HH:mm")}
    </span>
  );
}

function DayColumn({
  day,
  iso,
  tasks,
  computed,
  events,
  afterHoursMin,
  categories,
}: {
  day: Date;
  iso: string;
  tasks: any[];
  computed: any[];
  events: any[];
  afterHoursMin: number;
  categories: any[];
}) {
  const qc = useQueryClient();
  const reorderFn = useServerFn(reorderDay);
  const updateFn = useServerFn(updateTask);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const isToday = iso === isoDay(new Date());

  const orderedIds = computed.map((t) => t.id);
  const firstAfterHoursIdx = computed.findIndex((t) => t.afterHours);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = orderedIds.indexOf(e.active.id as string);
    const newIdx = orderedIds.indexOf(e.over.id as string);
    const next = arrayMove(orderedIds, oldIdx, newIdx);
    qc.setQueryData(["week", isoDay(weekDays(day)[0])], (prev: any) => {
      if (!prev) return prev;
      const newTasks = prev.tasks.map((t: any) => {
        if (t.scheduled_day !== iso) return t;
        const i = next.indexOf(t.id);
        return i >= 0 ? { ...t, queue_position: i } : t;
      });
      return { ...prev, tasks: newTasks };
    });
    reorderFn({ data: { scheduled_day: iso, ordered_ids: next } })
      .then(() => qc.invalidateQueries({ queryKey: ["week"] }))
      .catch(() => toast.error("Não foi possível reordenar"));
  }

  function onResizeCommit(id: string, minutes: number) {
    qc.setQueryData(["week", isoDay(weekDays(day)[0])], (prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        tasks: prev.tasks.map((t: any) => (t.id === id ? { ...t, estimated_minutes: minutes } : t)),
      };
    });
    updateFn({ data: { id, estimated_minutes: minutes } })
      .then(() => qc.invalidateQueries({ queryKey: ["week"] }))
      .catch(() => toast.error("Falha ao salvar duração"));
  }

  return (
    <div
      className={`relative flex min-w-0 flex-col border-r border-border transition-colors ${
        isToday ? "bg-accent/40" : ""
      }`}
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background/85 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className={`text-xs font-semibold ${isToday ? "text-primary" : "text-foreground"}`}>
            {dayLabel(day)}
          </span>
          {isToday && <NowBadge />}
        </div>
        <AddTaskButton iso={iso} categories={categories} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            {computed.map((t, i) => (
              <div key={t.id}>
                {i === firstAfterHoursIdx && firstAfterHoursIdx > 0 && (
                  <AfterHoursDivider afterHoursMin={afterHoursMin} />
                )}
                <TaskCard
                  task={t}
                  categories={categories}
                  onToggle={() => {
                    const next = t.status === "done" ? "pending" : "done";
                    qc.setQueryData(["week", isoDay(weekDays(day)[0])], (prev: any) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        tasks: prev.tasks.map((x: any) =>
                          x.id === t.id ? { ...x, status: next } : x,
                        ),
                      };
                    });
                    updateFn({ data: { id: t.id, status: next } }).then(() =>
                      qc.invalidateQueries({ queryKey: ["week"] }),
                    );
                  }}
                  onResizeCommit={(min) => onResizeCommit(t.id, min)}
                />
              </div>
            ))}
          </SortableContext>
        </DndContext>
        {computed.length === 0 && events.length === 0 && (
          <p className="mt-8 text-center text-xs text-muted-foreground">Dia livre</p>
        )}
      </div>
    </div>
  );
}

function AfterHoursDivider({ afterHoursMin }: { afterHoursMin: number }) {
  const hh = String(Math.floor(afterHoursMin / 60)).padStart(2, "0");
  const mm = String(afterHoursMin % 60).padStart(2, "0");
  return (
    <div className="my-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wide text-after-hours">
      <Moon className="h-3 w-3" />
      <span>após {hh}:{mm}</span>
      <span className="h-px flex-1 border-t border-dashed border-after-hours/40" />
    </div>
  );
}

function TaskCard({
  task,
  categories,
  onToggle,
  onResizeCommit,
}: {
  task: any;
  categories: any[];
  onToggle: () => void;
  onResizeCommit: (minutes: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const [overrideMin, setOverrideMin] = useState<number | null>(null);
  const minutes = overrideMin ?? task.estimated_minutes ?? 30;
  const height = Math.max(MIN_CARD_PX, Math.round(minutes * PX_PER_MIN));

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? transition : `${transition ?? ""}, height 180ms ease-out`,
    opacity: isDragging ? 0.6 : 1,
    height,
  };

  const cat = categories.find((c) => c.id === task.category_id);
  const start = task.scheduled_start ? format(new Date(task.scheduled_start), "HH:mm") : "--:--";
  const end = task.scheduled_end ? format(new Date(task.scheduled_end), "HH:mm") : "--:--";
  const done = task.status === "done";

  const resizingRef = useRef<{ startY: number; startMin: number } | null>(null);
  function onResizeStart(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizingRef.current = { startY: e.clientY, startMin: minutes };
  }
  function onResizeMove(e: React.PointerEvent) {
    const r = resizingRef.current;
    if (!r) return;
    const deltaMin = Math.round((e.clientY - r.startY) / PX_PER_MIN / 5) * 5;
    const next = Math.max(5, Math.min(720, r.startMin + deltaMin));
    setOverrideMin(next);
  }
  function onResizeEnd(e: React.PointerEvent) {
    const r = resizingRef.current;
    if (!r) return;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    resizingRef.current = null;
    if (overrideMin != null && overrideMin !== task.estimated_minutes) {
      onResizeCommit(overrideMin);
    }
    setOverrideMin(null);
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-xs shadow-sm transition-[box-shadow,border-color,background-color] hover:shadow-md ${
        done ? "opacity-50" : ""
      } ${task.afterHours ? "border-after-hours/50 bg-after-hours/5" : "border-border"} ${
        isDragging ? "ring-2 ring-primary/40" : ""
      }`}
    >
      {cat && (
        <div
          className="absolute left-0 top-0 h-full w-[3px]"
          style={{ backgroundColor: cat.color }}
        />
      )}

      <div className="flex flex-1 items-start gap-2 px-3 py-2 pl-3.5">
        <button
          onClick={onToggle}
          aria-label={done ? "Marcar como pendente" : "Marcar como concluída"}
          className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all ${
            done
              ? "border-primary bg-primary"
              : "border-muted-foreground/40 hover:border-primary hover:scale-110"
          }`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1">
            <p
              {...attributes}
              {...listeners}
              className={`flex-1 cursor-grab font-medium leading-snug active:cursor-grabbing ${
                done ? "line-through text-muted-foreground" : "text-foreground"
              }`}
            >
              {task.title}
            </p>
            <GripVertical
              {...attributes}
              {...listeners}
              className="mt-0.5 h-3 w-3 shrink-0 cursor-grab text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
            <span className="font-medium">{start}–{end}</span>
            <span>·</span>
            <span>{minutes}m</span>
            {cat && (
              <>
                <span>·</span>
                <span style={{ color: cat.color }} className="font-medium">
                  {cat.name}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Resize handle */}
      <div
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
        onPointerCancel={onResizeEnd}
        className="group/resize absolute inset-x-0 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center"
        title="Arraste para redimensionar"
      >
        <span className="h-0.5 w-8 rounded-full bg-muted-foreground/20 transition-colors group-hover/resize:bg-primary/60" />
      </div>

      {resizingRef.current && overrideMin != null && (
        <div className="pointer-events-none absolute right-2 top-2 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow">
          {overrideMin}m
        </div>
      )}
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  const startD = new Date(event.starts_at);
  const endD = new Date(event.ends_at);
  const minutes = Math.max(15, Math.round((endD.getTime() - startD.getTime()) / 60000));
  const height = Math.max(MIN_CARD_PX, Math.round(minutes * PX_PER_MIN));
  const start = format(startD, "HH:mm");
  const end = format(endD, "HH:mm");
  return (
    <div
      style={{ height }}
      className="relative overflow-hidden rounded-xl border border-dashed border-event-foreground/25 bg-event px-3 py-2 text-xs text-event-foreground"
    >
      <p className="truncate font-medium">{event.title}</p>
      <p className="mt-0.5 text-[10px] tabular-nums opacity-70">
        {start}–{end} · Google Calendar
      </p>
    </div>
  );
}

function AddTaskButton({ iso, categories }: { iso: string; categories: any[] }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createTask);
  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: "Nova tarefa",
          estimated_minutes: 30,
          scheduled_day: iso,
          priority: "medium",
          category_id: categories[0]?.id ?? null,
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week"] }),
  });
  return (
    <button
      onClick={() => mut.mutate()}
      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Adicionar tarefa"
      aria-label="Adicionar tarefa"
    >
      <Plus className="h-3.5 w-3.5" />
    </button>
  );
}

function QuickAddBar({ todayISO }: { todayISO: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const parseFn = useServerFn(quickAddParse);
  const createFn = useServerFn(createTask);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      const parsed = await parseFn({ data: { text, today: todayISO } });
      await createFn({
        data: {
          title: parsed.title,
          estimated_minutes: parsed.estimated_minutes,
          scheduled_day: parsed.scheduled_day,
          priority: parsed.priority,
          due_date: parsed.due_date,
        },
      });
      setText("");
      toast.success("Tarefa criada", { description: parsed.title });
      qc.invalidateQueries({ queryKey: ["week"] });
    } catch (err: any) {
      toast.error("Quick Add falhou", { description: err?.message ?? String(err) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="relative">
      <Sparkles
        className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary transition-opacity ${
          busy ? "animate-pulse opacity-100" : "opacity-80"
        }`}
      />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder='Ex: "Revisar contrato amanhã 2h"'
        className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      />
    </form>
  );
}
