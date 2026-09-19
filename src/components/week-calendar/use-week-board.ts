import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { carryUnfinished, listWeekData, rescheduleTasks, updateTask } from "@/lib/tasks.functions";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";

export interface RawTask {
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

/** Owns the week query, its cache-backed mutations, and derived lookups. */
export function useWeekBoard(daysISO: string[]) {
  const listFn = useServerFn(listWeekData);
  const rescheduleFn = useServerFn(rescheduleTasks);
  const updateFn = useServerFn(updateTask);
  const carryFn = useServerFn(carryUnfinished);
  const qc = useQueryClient();

  const queryKey = ["week", daysISO[0]] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listFn({ data: { days: daysISO } }),
  });
  type WeekData = NonNullable<typeof data>;

  const rescheduleMut = useMutation({
    mutationFn: (updates: { id: string; scheduled_day: string; start_minute: number }[]) =>
      rescheduleFn({ data: { updates, tz_offset_minutes: getLocalTzOffsetMinutes() } }),
    onError: () => {
      toast.error("Não foi possível reagendar");
      qc.invalidateQueries({ queryKey: ["week"] });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["week"] }),
  });

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
    onError: (_err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Não foi possível atualizar status");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

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

  const categories = (data?.categories ?? []) as { id: string; name: string; color: string }[];
  const projects = (data?.projects ?? []) as { id: string; name: string; color: string }[];
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );
  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  return {
    queryKey,
    listFn,
    qc,
    data,
    isLoading,
    categories,
    projects,
    categoryById,
    projectById,
    rescheduleMut,
    toggleStatusMut,
    carryMut,
  };
}

export type WeekBoard = ReturnType<typeof useWeekBoard>;
