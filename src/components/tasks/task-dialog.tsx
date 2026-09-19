import { Copy, Inbox, Trash2, Loader2, ChevronDown, Repeat } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

import { SubtaskList } from "./subtask-list";
import { EntityPicker } from "./entity-picker";
import { RecurrenceFields } from "./recurrence-fields";
import { DeleteTaskDialog } from "./delete-task-dialog";
import { useTaskDialogForm } from "./use-task-dialog-form";

export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "pending" | "in_progress" | "done" | "skipped";

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
  const f = useTaskDialogForm({ open, task, defaultDay, defaultStartMinute, onOpenChange });
  const isEdit = f.isEdit;

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
                value={f.title}
                onChange={(e) => f.setTitle(e.target.value)}
                placeholder="O que precisa ser feito?"
                autoFocus
                maxLength={280}
              />
            </div>

            <div className="grid gap-1">
              <Label htmlFor="t-desc">Descrição</Label>
              <Textarea
                id="t-desc"
                value={f.description}
                onChange={(e) => f.setDescription(e.target.value)}
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
                  value={f.categoryId === "none" ? null : f.categoryId}
                  onChange={(id) => f.setCategoryId(id ?? "none")}
                  options={categories}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-between font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {(() => {
                          const c = categories.find((x) => x.id === f.categoryId);
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
                  value={f.projectId === "none" ? null : f.projectId}
                  onChange={(id) => f.setProjectId(id ?? "none")}
                  options={projects}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 w-full justify-between font-normal"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {(() => {
                          const p = projects.find((x) => x.id === f.projectId);
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
                  value={f.duration}
                  onChange={(e) => f.setDuration(Number(e.target.value) || 30)}
                />
              </div>
              <div className="grid gap-1">
                <Label>Prioridade</Label>
                <Select value={f.priority} onValueChange={(v) => f.setPriority(v as Priority)}>
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
                  <Select value={f.status} onValueChange={(v) => f.setStatus(v as Status)}>
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
                  value={f.day}
                  onChange={(e) => f.setDay(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-start">Horário</Label>
                <Input
                  id="t-start"
                  type="time"
                  value={f.startTime}
                  onChange={(e) => f.setStartTime(e.target.value)}
                />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="t-due">Prazo</Label>
                <Input
                  id="t-due"
                  type="date"
                  value={f.dueDate}
                  onChange={(e) => f.setDueDate(e.target.value)}
                />
              </div>
            </div>

            {!isEdit && (
              <RecurrenceFields
                day={f.day}
                recFreq={f.recFreq}
                setRecFreq={f.setRecFreq}
                recInterval={f.recInterval}
                setRecInterval={f.setRecInterval}
                recUnit={f.recUnit}
                setRecUnit={f.setRecUnit}
                recWeekdays={f.recWeekdays}
                setRecWeekdays={f.setRecWeekdays}
                recUntil={f.recUntil}
                setRecUntil={f.setRecUntil}
              />
            )}

            {isEdit && task?.series_id && (
              <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                <Repeat className="h-3.5 w-3.5" />
                Parte de uma série recorrente. Edições aqui afetam apenas esta ocorrência.
              </div>
            )}

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
                value={f.notes}
                onChange={(e) => f.setNotes(e.target.value)}
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
                    onClick={() => f.setConfirmDelete(true)}
                    disabled={f.deleteMut.isPending}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    Excluir
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => f.duplicateMut.mutate()}
                    disabled={f.duplicateMut.isPending}
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => f.moveInboxMut.mutate()}
                    disabled={f.moveInboxMut.isPending}
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
                onClick={() => f.saveMut.mutate()}
                disabled={!f.title.trim() || f.saveMut.isPending}
              >
                {f.saveMut.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Salvar
                <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">⌘↵</span>
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteTaskDialog
        open={f.confirmDelete}
        onOpenChange={f.setConfirmDelete}
        hasSeries={!!task?.series_id}
        onConfirm={(scope) => f.deleteMut.mutate(scope)}
      />
    </>
  );
}
