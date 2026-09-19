import { useEffect, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
  sendToInbox,
  deleteSeries,
} from "@/lib/tasks.functions";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";
import {
  defaultUntilFor,
  type RecurrenceRule,
  type RecurrenceFreq,
  type CustomUnit,
} from "@/lib/queue/recurrence";
import type { TaskDialogTask, Priority, Status } from "./task-dialog";

function minuteToHHMM(m: number | null | undefined): string {
  if (m == null) return "";
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
}
function hhmmToMinute(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
function tsToMinute(ts: string | null): number | null {
  if (!ts) return null;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

interface UseTaskDialogFormArgs {
  open: boolean;
  task?: TaskDialogTask | null;
  defaultDay: string;
  defaultStartMinute?: number | null;
  onOpenChange: (open: boolean) => void;
}

/** Owns all form state, the reset-on-open effect, and the four mutations (save/delete/duplicate/move-to-inbox). */
export function useTaskDialogForm({
  open,
  task,
  defaultDay,
  defaultStartMinute,
  onOpenChange,
}: UseTaskDialogFormArgs) {
  const isEdit = !!task;
  const qc = useQueryClient();
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);
  const deleteSeriesFn = useServerFn(deleteSeries);
  const duplicateFn = useServerFn(duplicateTask);
  const inboxFn = useServerFn(sendToInbox);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState<string>("none");
  const [projectId, setProjectId] = useState<string>("none");
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState<Priority>("medium");
  const [status, setStatus] = useState<Status>("pending");
  const [day, setDay] = useState(defaultDay);
  const [startTime, setStartTime] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Recurrence (create-mode only)
  const [recFreq, setRecFreq] = useState<"none" | RecurrenceFreq>("none");
  const [recInterval, setRecInterval] = useState(1);
  const [recUnit, setRecUnit] = useState<CustomUnit>("week");
  const [recWeekdays, setRecWeekdays] = useState<number[]>([]);
  const [recUntil, setRecUntil] = useState("");

  // Reset state when dialog opens
  useEffect(() => {
    if (!open) return;
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? "");
      setNotes(task.notes ?? "");
      setCategoryId(task.category_id ?? "none");
      setProjectId(task.project_id ?? "none");
      setDuration(task.estimated_minutes);
      setPriority(task.priority);
      setStatus(task.status);
      setDay(task.scheduled_day);
      setStartTime(minuteToHHMM(tsToMinute(task.scheduled_start)));
      setDueDate(task.due_date ?? "");
    } else {
      setTitle("");
      setDescription("");
      setNotes("");
      setCategoryId("none");
      setProjectId("none");
      setDuration(30);
      setPriority("medium");
      setStatus("pending");
      setDay(defaultDay);
      setStartTime(minuteToHHMM(defaultStartMinute ?? null));
      setDueDate("");
      setRecFreq("none");
      setRecInterval(1);
      setRecUnit("week");
      setRecWeekdays([]);
      setRecUntil("");
    }
  }, [open, task, defaultDay, defaultStartMinute]);

  const recurrencePayload = (): RecurrenceRule | null => {
    if (recFreq === "none") return null;
    const until = recUntil || defaultUntilFor(day);
    if (recFreq === "custom") {
      return {
        freq: "custom",
        interval: recInterval,
        unit: recUnit,
        byweekday: recUnit === "week" && recWeekdays.length ? recWeekdays : undefined,
        until,
      };
    }
    if (recFreq === "weekly" || recFreq === "biweekly") {
      return {
        freq: recFreq,
        byweekday: recWeekdays.length ? recWeekdays : undefined,
        until,
      };
    }
    return { freq: recFreq, until };
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const start_minute = hhmmToMinute(startTime);
      const common = {
        title: title.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        estimated_minutes: duration,
        priority,
        scheduled_day: day,
        start_minute,
        category_id: categoryId === "none" ? null : categoryId,
        project_id: projectId === "none" ? null : projectId,
        due_date: dueDate || null,
        tz_offset_minutes: getLocalTzOffsetMinutes(),
      };
      if (isEdit && task) {
        return updateFn({ data: { id: task.id, ...common, status } });
      }
      return createFn({ data: { ...common, recurrence: recurrencePayload() } });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["week"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error("Falha ao salvar", { description: String(err) }),
  });

  const deleteMut = useMutation({
    mutationFn: async (scope: "single" | "future" | "all") => {
      if (scope !== "single" && task?.series_id) {
        await deleteSeriesFn({
          data: {
            series_id: task.series_id,
            from_date: scope === "future" ? task.scheduled_day : null,
          },
        });
        return;
      }
      await deleteFn({ data: { id: task!.id } });
    },
    onSuccess: () => {
      toast.success("Excluído");
      qc.invalidateQueries({ queryKey: ["week"] });
      setConfirmDelete(false);
      onOpenChange(false);
    },
    onError: (err) => toast.error("Falha ao excluir", { description: String(err) }),
  });

  const duplicateMut = useMutation({
    mutationFn: () => duplicateFn({ data: { id: task!.id } }),
    onSuccess: () => {
      toast.success("Tarefa duplicada");
      qc.invalidateQueries({ queryKey: ["week"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error("Falha ao duplicar", { description: String(err) }),
  });

  const moveInboxMut = useMutation({
    mutationFn: () => inboxFn({ data: { id: task!.id } }),
    onSuccess: () => {
      toast.success("Movida para Inbox");
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error("Falha ao mover", { description: String(err) }),
  });

  // Cmd/Ctrl+Enter to save
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (title.trim()) saveMut.mutate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, title, saveMut]);

  return {
    isEdit,
    title,
    setTitle,
    description,
    setDescription,
    notes,
    setNotes,
    categoryId,
    setCategoryId,
    projectId,
    setProjectId,
    duration,
    setDuration,
    priority,
    setPriority,
    status,
    setStatus,
    day,
    setDay,
    startTime,
    setStartTime,
    dueDate,
    setDueDate,
    confirmDelete,
    setConfirmDelete,
    recFreq,
    setRecFreq,
    recInterval,
    setRecInterval,
    recUnit,
    setRecUnit,
    recWeekdays,
    setRecWeekdays,
    recUntil,
    setRecUntil,
    saveMut,
    deleteMut,
    duplicateMut,
    moveInboxMut,
  };
}
