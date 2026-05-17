import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { Sparkles, Plus, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { listWeekData, createTask, updateTask, reorderDay, carryUnfinished } from "@/lib/tasks.functions";
import { quickAddParse } from "@/lib/quick-add.functions";
import { syncCalendarRange } from "@/lib/calendar.functions";
import { scheduleWeek, type SchedulerEvent } from "@/lib/queue/scheduler";
import { weekDays, isoDay, dayLabel } from "@/lib/queue/dates";
import { supabase } from "@/integrations/supabase/client";

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

  // Carry once on mount
  useEffect(() => {
    carryFn({ data: undefined as never }).catch(() => {});
  }, [carryFn]);

  // Sync calendar on mount / week change
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.provider_token;
      if (!token) return;
      syncFn({
        data: { provider_token: token, from: daysISO[0], to: daysISO[6] },
      })
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
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold">Semana</h1>
        <div className="ml-2 flex items-center gap-1">
          <button
            onClick={() => setAnchor((d) => addDays(d, -7))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setAnchor(new Date())}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Hoje
          </button>
          <button
            onClick={() => setAnchor((d) => addDays(d, 7))}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
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
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-muted-foreground">
          Carregando…
        </div>
      )}
    </div>
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

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const isToday = iso === isoDay(new Date());

  const orderedIds = computed.map((t) => t.id);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const oldIdx = orderedIds.indexOf(e.active.id as string);
    const newIdx = orderedIds.indexOf(e.over.id as string);
    const next = arrayMove(orderedIds, oldIdx, newIdx);
    qc.setQueryData(["week", isoDay(weekDays(day)[0])], (prev: any) => {
      if (!prev) return prev;
      // optimistic queue_position update
      const byId = new Map(prev.tasks.map((t: any) => [t.id, t]));
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

  return (
    <div className={`flex min-w-0 flex-col border-r border-border ${isToday ? "bg-accent/30" : ""}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="text-xs font-medium text-muted-foreground">{dayLabel(day)}</span>
        <AddTaskButton iso={iso} categories={categories} />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
            {computed.map((t) => (
              <TaskCard
                key={t.id}
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
              />
            ))}
          </SortableContext>
        </DndContext>
        {computed.length === 0 && events.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">Dia livre</p>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  categories,
  onToggle,
}: {
  task: any;
  categories: any[];
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const cat = categories.find((c) => c.id === task.category_id);
  const start = task.scheduled_start ? format(new Date(task.scheduled_start), "HH:mm") : "--:--";
  const end = task.scheduled_end ? format(new Date(task.scheduled_end), "HH:mm") : "--:--";
  const done = task.status === "done";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border bg-card p-2.5 text-xs shadow-sm transition ${
        done ? "opacity-50" : ""
      } ${task.afterHours ? "border-after-hours/60" : "border-border"}`}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border ${
            done ? "bg-primary border-primary" : "border-muted-foreground/40"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p
            {...attributes}
            {...listeners}
            className={`cursor-grab font-medium leading-snug ${done ? "line-through" : ""}`}
          >
            {task.title}
          </p>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span>{start}–{end}</span>
            <span>·</span>
            <span>{task.estimated_minutes}m</span>
            {cat && (
              <>
                <span>·</span>
                <span style={{ color: cat.color }}>{cat.name}</span>
              </>
            )}
            {task.afterHours && (
              <span className="ml-auto inline-flex items-center gap-0.5 rounded bg-after-hours/20 px-1 py-0.5 text-after-hours-foreground">
                <AlertTriangle className="h-2.5 w-2.5" /> tarde
              </span>
            )}
          </div>
        </div>
      </div>
      {cat && (
        <div
          className="absolute left-0 top-0 h-full w-0.5 rounded-l-lg"
          style={{ backgroundColor: cat.color }}
        />
      )}
    </div>
  );
}

function EventCard({ event }: { event: any }) {
  const start = format(new Date(event.starts_at), "HH:mm");
  const end = format(new Date(event.ends_at), "HH:mm");
  return (
    <div className="rounded-lg border border-border bg-event px-2.5 py-2 text-xs text-event-foreground">
      <p className="font-medium">{event.title}</p>
      <p className="mt-0.5 text-[10px] opacity-70">
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
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      title="Adicionar tarefa"
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
      <Sparkles className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder='Ex: "Revisar contrato amanhã 2h"'
        className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none disabled:opacity-50"
      />
    </form>
  );
}
