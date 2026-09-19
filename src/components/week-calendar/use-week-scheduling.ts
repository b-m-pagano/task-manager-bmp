import { useCallback } from "react";
import { toast } from "sonner";
import { WORK_START_HOUR } from "./time-grid";
import { reflowConflicts, reflowDay, type ReflowBlock, type ReflowTask } from "@/lib/queue/reflow";
import { autoScheduleDay, type AutoTask, type AutoBlock } from "@/lib/queue/auto-schedule";
import type { RawTask, WeekBoard } from "./use-week-board";

type WeekData = NonNullable<WeekBoard["data"]>;

function tsToMinute(ts: string | null, fallback: number): number {
  if (!ts) return fallback;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Scheduling algorithms for the week board: intelligent drop (reflow),
 * post-sync conflict reflow, and full-day auto-replan. Kept separate from
 * useWeekBoard since these are pure orchestration on top of its data/cache.
 */
export function useWeekScheduling(board: WeekBoard, daysISO: string[]) {
  const { data, qc, listFn, rescheduleMut, queryKey } = board;

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
        .filter((e) => (e.starts_at ?? "").slice(0, 10) === targetDay)
        .map((e) => {
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
      qc.setQueryData(queryKey, (prev: WeekData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) => {
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
    [data, qc, queryKey, rescheduleMut],
  );

  /**
   * Após sincronizar Google Calendar: detecta tarefas que passaram a colidir
   * com eventos externos e empurra-as para o próximo espaço livre, mantendo
   * ordem relativa. Eventos externos têm prioridade absoluta.
   */
  const handleSynced = useCallback(async () => {
    const fresh = await qc.fetchQuery({
      queryKey,
      queryFn: () => listFn({ data: { days: daysISO } }),
    });
    const allUpdates: { id: string; scheduled_day: string; start_minute: number }[] = [];
    for (const iso of daysISO) {
      const dayTasks = (fresh.tasks as RawTask[]).filter(
        (t) => t.scheduled_day === iso && !t.parent_id,
      );
      if (dayTasks.length === 0) continue;
      const dayEvents: ReflowBlock[] = (fresh.events ?? [])
        .filter((e) => (e.starts_at ?? "").slice(0, 10) === iso)
        .map((e) => {
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
  }, [daysISO, listFn, qc, queryKey, rescheduleMut]);

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
      const dayEvents: AutoBlock[] = (data?.events ?? [])
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

      qc.setQueryData(queryKey, (prev: WeekData | undefined) => {
        if (!prev) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map((t) => {
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
          afterHoursCount > 0 ? `${afterHoursCount} ultrapassa(m) 18h` : "Sequência otimizada",
      });
    },
    [data, qc, queryKey, rescheduleMut],
  );

  const applySuggestion = useCallback(
    (taskId: string, day: string, startMinute: number) => {
      const update = { id: taskId, scheduled_day: day, start_minute: startMinute };
      qc.setQueryData(queryKey, (prev: WeekData | undefined) => {
        if (!prev) return prev;
        const h = String(Math.floor(startMinute / 60)).padStart(2, "0");
        const m = String(startMinute % 60).padStart(2, "0");
        return {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? { ...t, scheduled_day: day, scheduled_start: `${day}T${h}:${m}:00` }
              : t,
          ),
        };
      });
      rescheduleMut.mutate([update]);
    },
    [qc, queryKey, rescheduleMut],
  );

  return { handleDrop, handleSynced, replanDay, applySuggestion };
}
