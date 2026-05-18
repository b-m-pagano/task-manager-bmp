import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { CheckCircle2, Circle, CircleDot, Loader2, Sun } from "lucide-react";
import { toast } from "sonner";

import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import { listWeekData, updateTask } from "@/lib/tasks.functions";
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

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { days: [today] } }),
  });

  const tasks = useMemo(() => {
    const all = ((data?.tasks ?? []) as Task[]).filter(
      (t) => t.scheduled_day === today && !t.parent_id,
    );
    return all.sort(
      (a, b) => tsToMinute(a.scheduled_start) - tsToMinute(b.scheduled_start),
    );
  }, [data, today]);

  const categories = (data?.categories ?? []) as { id: string; name: string; color: string }[];
  const projects = (data?.projects ?? []) as { id: string; name: string; color: string }[];
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);

  const toggleStatusMut = useMutation({
    mutationFn: (v: { id: string; status: "pending" | "done" }) =>
      updateFn({ data: { id: v.id, status: v.status } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<any>(queryKey);
      qc.setQueryData(queryKey, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: old.tasks.map((t: Task) =>
            t.id === v.id ? { ...t, status: v.status } : t,
          ),
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
            <p className="text-xs text-muted-foreground">
              Use a aba Semana para agendar tarefas.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {tasks.map((t) => {
            const isToggling =
              toggleStatusMut.isPending && toggleStatusMut.variables?.id === t.id;
            const isDone = t.status === "done";
            const cat = t.category_id ? categoryById[t.category_id] : null;
            const startMin = t.scheduled_start ? tsToMinute(t.scheduled_start) : null;
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40",
                  isDone && "opacity-60",
                )}
              >
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

                <button
                  onClick={() => openEdit(t)}
                  className="min-w-0 flex-1 text-left"
                  title="Editar"
                >
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      isDone ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {t.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {startMin != null && (
                      <span className="tabular-nums">{fmtMin(startMin)}</span>
                    )}
                    {startMin != null && <span>·</span>}
                    <span>{t.estimated_minutes}m</span>
                    {cat && (
                      <>
                        <span>·</span>
                        <span style={{ color: cat.color }}>{cat.name}</span>
                      </>
                    )}
                  </div>
                </button>

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
