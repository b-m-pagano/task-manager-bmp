import { useEffect, useState } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Inbox, Trash2, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createTask,
  updateTask,
  deleteTask,
  duplicateTask,
  sendToInbox,
  deleteSeries,
} from "@/lib/tasks.functions";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";
import { defaultUntilFor, type RecurrenceRule, type RecurrenceFreq, type CustomUnit } from "@/lib/queue/recurrence";
import { SubtaskList } from "./subtask-list";
import { EntityPicker } from "./entity-picker";
import { ChevronDown, Repeat } from "lucide-react";


type Priority = "low" | "medium" | "high" | "urgent";
type Status = "pending" | "in_progress" | "done" | "skipped";

interface Category {
  id: string;
  name: string;
  color: string;
}
interface Project {
  id: string;
  name: string;
  color: string;
}

export interface TaskDialogTask {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  estimated_minutes: number;
  priority: Priority;
  status: Status;
  category_id: string | null;
  project_id: string | null;
  scheduled_day: string;
  scheduled_start: string | null;
  due_date: string | null;
  parent_id: string | null;
  series_id?: string | null;
}


interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** undefined = create mode */
  task?: TaskDialogTask | null;
  /** Defaults used in create mode */
  defaultDay: string;
  defaultStartMinute?: number | null;
  categories: Category[];
  projects: Project[];
  onOpenSubtask?: (id: string) => void;
}

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

export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultDay,
  defaultStartMinute,
  categories,
  projects,
  onOpenSubtask,
}: TaskDialogProps) {
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
      return createFn({ data: common });
    },
    onSuccess: () => {
      toast.success(isEdit ? "Tarefa atualizada" : "Tarefa criada");
      qc.invalidateQueries({ queryKey: ["week"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error("Falha ao salvar", { description: String(err) }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFn({ data: { id: task!.id } }),
    onSuccess: () => {
      toast.success("Tarefa excluída");
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto p-5 sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            <div className="grid gap-1">
              <Label htmlFor="t-title">Título *</Label>
              <Input
                id="t-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="O que precisa ser feito?"
                autoFocus
                maxLength={280}
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="t-desc">Descrição</Label>
              <Textarea
                id="t-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Contexto, links, requisitos…"
                rows={2}
                maxLength={4000}
                className="resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="grid gap-1">
                <Label>Categoria</Label>
                <EntityPicker
                  kind="category"
                  value={categoryId === "none" ? null : categoryId}
                  onChange={(id) => setCategoryId(id ?? "none")}
                  options={categories}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-between font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {(() => {
                          const c = categories.find((x) => x.id === categoryId);
                          return c ? (
                            <>
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: c.color }}
                              />
                              <span className="truncate">{c.name}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sem categoria</span>
                          );
                        })()}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Button>
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label>Projeto</Label>
                <EntityPicker
                  kind="project"
                  value={projectId === "none" ? null : projectId}
                  onChange={(id) => setProjectId(id ?? "none")}
                  options={projects}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-between font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {(() => {
                          const p = projects.find((x) => x.id === projectId);
                          return p ? (
                            <>
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                                style={{ backgroundColor: p.color }}
                              />
                              <span className="truncate">{p.name}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Sem projeto</span>
                          );
                        })()}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                    </Button>
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-dur">Duração (min)</Label>
                <Input
                  id="t-dur"
                  type="number"
                  min={5}
                  max={720}
                  step={5}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) || 30)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Prioridade</Label>
                <Select
                  value={priority}
                  onValueChange={(v) => setPriority(v as Priority)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {isEdit && (
                <div className="grid gap-1">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pendente</SelectItem>
                      <SelectItem value="in_progress">Em andamento</SelectItem>
                      <SelectItem value="done">Concluída</SelectItem>
                      <SelectItem value="skipped">Ignorada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1">
                <Label htmlFor="t-day">Dia</Label>
                <Input
                  id="t-day"
                  type="date"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-start">Horário</Label>
                <Input
                  id="t-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-due">Prazo</Label>
                <Input
                  id="t-due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            {isEdit && task && (
              <div className="grid gap-1.5">
                <Label>Subtarefas</Label>
                <SubtaskList
                  parentId={task.id}
                  parentScheduledDay={task.scheduled_day}
                  onOpenSubtask={(id) => onOpenSubtask?.(id)}
                />
              </div>
            )}

            <div className="grid gap-1">
              <Label htmlFor="t-notes">Notas</Label>
              <Textarea
                id="t-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Pensamentos, lembretes, anotações livres…"
                rows={2}
                maxLength={10000}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">

            <div className="flex gap-2">
              {isEdit && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirmDelete(true)}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Excluir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => duplicateMut.mutate()}
                    disabled={duplicateMut.isPending}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => moveInboxMut.mutate()}
                    disabled={moveInboxMut.isPending}
                    title="Remove a data e devolve à Inbox"
                  >
                    <Inbox className="mr-1.5 h-3.5 w-3.5" />
                    Mover para Inbox
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!title.trim() || saveMut.isPending}
              >
                {saveMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar
                <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">⌘↵</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Subtarefas associadas permanecerão (sem pai).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
