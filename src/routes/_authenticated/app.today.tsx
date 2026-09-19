import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CheckCircle2, Circle, CircleDot, GripVertical, Loader2, Sun } from "lucide-react";
import { toast } from "sonner";

import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import { EntityPicker, type Entity } from "@/components/tasks/entity-picker";
import { listWeekData, rescheduleTasks, updateTask } from "@/lib/tasks.functions";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/today")({
  component: TodayPage,
  head: () => ({ meta: [{ title: "Hoje — BMP Task Manager" }] }),
});

type Task = {
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
};

type Block = { start: number; end: number };

const WORK_START_MIN = 8 * 60;
const AFTER_HOURS_MIN = 18 * 60;

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}
function tsToMinute(ts: string | null): number {
  if (!ts) return Number.MAX_SAFE_INTEGER;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}
function fmtMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Pack tasks sequentially in given order starting at WORK_START_MIN,
 * skipping over calendar-event blockers. Completed tasks keep their start
 * (or stack at the cursor if they have none) but never push others.
 */
function packSequential(ordered: Task[], blockers: Block[]): { id: string; start: number }[] {
  const sorted = [...blockers].sort((a, b) => a.start - b.start);
  let cursor = WORK_START_MIN;
  const out: { id: string; start: number }[] = [];

  const advancePastBlockers = (start: number, duration: number) => {
    let s = start;
    for (const b of sorted) {
      if (s + duration <= b.start) break;
      if (s < b.end && s + duration > b.start) {
        s = b.end;
      }
    }
    return s;
  };

  for (const t of ordered) {
    const start = advancePastBlockers(cursor, t.estimated_minutes);
    out.push({ id: t.id, start });
    cursor = start + t.estimated_minutes;
  }
  return out;
}

const priorityChip: Record<Task["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};
const priorityLabel: Record<Task["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

function TodayPage() {
  const qc = useQueryClient();
  const today = useMemo(() => isoDay(new Date()), []);
  const queryKey = ["today", today] as const;

  const listFn = useServerFn(listWeekData);
  const updateFn = useServerFn(updateTask);
  const rescheduleFn = useServerFn(rescheduleTasks);

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { days: [today] } }),
  });
  type WeekData = NonNullable<typeof data>;

  const tasks = useMemo(() => {
    const all = ((data?.tasks ?? []) as Task[]).filter(
      (t) => t.scheduled_day === today && !t.parent_id,
    );
    return all.sort((a, b) => tsToMinute(a.scheduled_start) - tsToMinute(b.scheduled_start));
  }, [data, today]);

  const blockers = useMemo<Block[]>(() => {
    return (data?.events ?? [])
      .filter((e) => (e.starts_at ?? "").slice(0, 10) === today)
      .map((e) => {
        const s = new Date(e.starts_at);
        const en = new Date(e.ends_at);
        return {
          start: s.getHours() * 60 + s.getMinutes(),
          end: en.getHours() * 60 + en.getMinutes(),
        };
      });
  }, [data, today]);

  const categories = (data?.categories ?? []) as Entity[];
  const projects = (data?.projects ?? []) as Entity[];
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const toggleStatusMut = useMutation({
    mutationFn: (v: { id: string; status: "pending" | "done" }) =>
      updateFn({ data: { id: v.id, status: v.status } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeekData>(queryKey);
      qc.setQueryData(queryKey, (old: WeekData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) => (t.id === v.id ? { ...t, status: v.status } : t)),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Não foi possível atualizar status");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
  });

  const assignMut = useMutation({
    mutationFn: (v: { id: string; field: "category_id" | "project_id"; value: string | null }) =>
      updateFn({
        data:
          v.field === "category_id"
            ? { id: v.id, category_id: v.value }
            : { id: v.id, project_id: v.value },
      }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<WeekData>(queryKey);
      qc.setQueryData(queryKey, (old: WeekData | undefined) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t) => (t.id === v.id ? { ...t, [v.field]: v.value } : t)),
        };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Não foi possível atualizar");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
  });

  const reorderMut = useMutation({
    mutationFn: (updates: { id: string; start_minute: number }[]) =>
      rescheduleFn({
        data: {
          updates: updates.map((u) => ({
            id: u.id,
            scheduled_day: today,
            start_minute: u.start_minute,
          })),
          tz_offset_minutes: getLocalTzOffsetMinutes(),
        },
      }),
    onError: (_e, _v, ctx) => {
      const prev = (ctx as { prev?: unknown } | undefined)?.prev;
      if (prev !== undefined) qc.setQueryData(queryKey, prev);
      toast.error("Não foi possível reordenar");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
  });

  /** Move task `srcId` to immediately before `destId` (or end if null). */
  const handleReorder = (srcId: string, destId: string | null) => {
    if (srcId === destId) return;
    const current = [...tasks];
    const srcIdx = current.findIndex((t) => t.id === srcId);
    if (srcIdx < 0) return;
    const [moved] = current.splice(srcIdx, 1);
    const destIdx = destId ? current.findIndex((t) => t.id === destId) : current.length;
    current.splice(destIdx < 0 ? current.length : destIdx, 0, moved);

    const placements = packSequential(current, blockers);

    // Optimistic patch
    const prev = qc.getQueryData<WeekData>(queryKey);
    qc.setQueryData(queryKey, (old: WeekData | undefined) => {
      if (!old) return old;
      const startMap = new Map(placements.map((p) => [p.id, p.start]));
      return {
        ...old,
        tasks: old.tasks.map((t) => {
          const newStart = startMap.get(t.id);
          if (newStart == null) return t;
          const h = String(Math.floor(newStart / 60)).padStart(2, "0");
          const m = String(newStart % 60).padStart(2, "0");
          return { ...t, scheduled_start: `${today}T${h}:${m}:00` };
        }),
      };
    });

    reorderMut.mutate(
      placements.map((p) => ({ id: p.id, start_minute: p.start })),
      { onError: () => qc.setQueryData(queryKey, prev) },
    );

    const overflow = placements.find(
      (p) =>
        p.start + (current.find((t) => t.id === p.id)?.estimated_minutes ?? 0) > AFTER_HOURS_MIN,
    );
    if (overflow) {
      toast.warning("Fila ultrapassa 18h", {
        description: "Algumas tarefas ficaram após o horário comercial",
      });
    }
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setDialogOpen(true);
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Sun className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold tracking-tight">Hoje</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {doneCount}/{tasks.length}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          {format(new Date(), "EEEE, d 'de' MMMM")}
        </span>
      </header>

      <div className="flex flex-col gap-3 p-6">
        {isLoading && <p className="text-xs text-muted-foreground">Carregando…</p>}

        {!isLoading && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
            <Sun className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Nada agendado para hoje</p>
            <p className="text-xs text-muted-foreground">Use a aba Semana para agendar tarefas.</p>
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => {
            const isToggling = toggleStatusMut.isPending && toggleStatusMut.variables?.id === t.id;
            const isDone = t.status === "done";
            const cat = t.category_id ? categoryById[t.category_id] : null;
            const proj = t.project_id ? projectById[t.project_id] : null;
            const startMin = t.scheduled_start ? tsToMinute(t.scheduled_start) : null;
            const isDragging = dragId === t.id;
            const isOver = overId === t.id && dragId && dragId !== t.id;
            return (
              <li
                key={t.id}
                draggable
                onDragStart={(e) => {
                  setDragId(t.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", t.id);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverId(null);
                }}
                onDragOver={(e) => {
                  if (!dragId || dragId === t.id) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverId(t.id);
                }}
                onDragLeave={() => {
                  if (overId === t.id) setOverId(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const src = e.dataTransfer.getData("text/plain") || dragId;
                  if (src && src !== t.id) handleReorder(src, t.id);
                  setDragId(null);
                  setOverId(null);
                }}
                className={cn(
                  "group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-all hover:border-primary/40",
                  isDone && "opacity-60",
                  isDragging && "opacity-40",
                  isOver && "border-primary ring-2 ring-primary/30",
                )}
              >
                <span
                  className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
                  title="Arraste para reordenar"
                  aria-hidden
                >
                  <GripVertical className="h-4 w-4" />
                </span>

                <button
                  type="button"
                  onClick={() =>
                    toggleStatusMut.mutate({
                      id: t.id,
                      status: isDone ? "pending" : "done",
                    })
                  }
                  disabled={isToggling}
                  title={isDone ? "Marcar como pendente" : "Concluir"}
                  aria-label={isDone ? "Marcar como pendente" : "Concluir"}
                  className={cn(
                    "shrink-0 rounded-full transition-transform hover:scale-110",
                    isToggling && "pointer-events-none animate-pulse opacity-60",
                  )}
                >
                  {isToggling ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-now" />
                  ) : t.status === "in_progress" ? (
                    <CircleDot className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground/50" />
                  )}
                </button>

                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button onClick={() => openEdit(t)} className="min-w-0 text-left" title="Editar">
                    <p
                      className={cn(
                        "truncate text-sm font-medium",
                        isDone ? "text-muted-foreground line-through" : "text-foreground",
                      )}
                    >
                      {t.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      {startMin != null && startMin < Number.MAX_SAFE_INTEGER && (
                        <>
                          <span className="tabular-nums">{fmtMin(startMin)}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>{t.estimated_minutes}m</span>
                    </div>
                  </button>
                  <div className="flex flex-wrap items-center gap-1">
                    <EntityPicker
                      kind="category"
                      value={t.category_id}
                      onChange={(id) =>
                        assignMut.mutate({ id: t.id, field: "category_id", value: id })
                      }
                      options={categories}
                      trigger={
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-primary/50 hover:bg-muted",
                            !cat && "text-muted-foreground/70",
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{
                              backgroundColor: cat?.color ?? "transparent",
                              border: cat ? "none" : "1px dashed currentColor",
                            }}
                          />
                          {cat ? cat.name : "Categoria"}
                        </button>
                      }
                    />
                    <EntityPicker
                      kind="project"
                      value={t.project_id}
                      onChange={(id) =>
                        assignMut.mutate({ id: t.id, field: "project_id", value: id })
                      }
                      options={projects}
                      trigger={
                        <button
                          type="button"
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium transition-colors hover:border-primary/50 hover:bg-muted",
                            !proj && "text-muted-foreground/70",
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-sm"
                            style={{
                              backgroundColor: proj?.color ?? "transparent",
                              border: proj ? "none" : "1px dashed currentColor",
                            }}
                          />
                          {proj ? proj.name : "Projeto"}
                        </button>
                      }
                    />
                  </div>
                </div>

                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    priorityChip[t.priority],
                  )}
                >
                  {priorityLabel[t.priority]}
                </span>
              </li>
            );
          })}

          {/* Drop zone at end of list */}
          {tasks.length > 0 && dragId && (
            <li
              onDragOver={(e) => {
                e.preventDefault();
                setOverId("__end__");
              }}
              onDrop={(e) => {
                e.preventDefault();
                const src = e.dataTransfer.getData("text/plain") || dragId;
                if (src) handleReorder(src, null);
                setDragId(null);
                setOverId(null);
              }}
              className={cn(
                "h-8 rounded-md border-2 border-dashed transition-colors",
                overId === "__end__" ? "border-primary bg-primary/5" : "border-border",
              )}
            />
          )}
        </ul>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editing}
        defaultDay={today}
        categories={categories}
        projects={projects}
      />
    </div>
  );
}
