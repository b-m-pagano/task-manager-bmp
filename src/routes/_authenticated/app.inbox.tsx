import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { addDays, format } from "date-fns";
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Inbox as InboxIcon,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MiniCalendar } from "@/components/week-calendar/mini-calendar";
import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";
import {
  createTask,
  deleteTask,
  listInbox,
  scheduleFromInbox,
  updateTask,
  listWeekData,
} from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  component: InboxPage,
  head: () => ({ meta: [{ title: "Inbox — BMP Task Manager" }] }),
});

type InboxTask = {
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

const priorityChip: Record<InboxTask["priority"], string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};
const priorityLabel: Record<InboxTask["priority"], string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function InboxPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInbox);
  const scheduleFn = useServerFn(scheduleFromInbox);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);
  const createFn = useServerFn(createTask);
  const weekFn = useServerFn(listWeekData);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["inbox"],
    queryFn: () => listFn(),
  });

  // Need categories/projects for the dialog — reuse weekly fetch.
  const today = isoDay(new Date());
  const { data: weekData } = useQuery({
    queryKey: ["week-meta", today],
    queryFn: () => weekFn({ data: { days: [today] } }),
  });
  const categories = (weekData?.categories ?? []) as {
    id: string;
    name: string;
    color: string;
  }[];
  const projects = (weekData?.projects ?? []) as {
    id: string;
    name: string;
    color: string;
  }[];

  const items = (data ?? []) as InboxTask[];
  const count = items.length;

  const scheduleMut = useMutation({
    mutationFn: (input: { id: string; day: string }) =>
      scheduleFn({
        data: { id: input.id, scheduled_day: input.day, start_minute: null },
      }),
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      qc.invalidateQueries({ queryKey: ["week"] });
      toast.success("Agendada", { description: `→ ${input.day}` });
    },
    onError: () => toast.error("Não foi possível agendar"),
  });

  const completeMut = useMutation({
    mutationFn: (id: string) =>
      updateFn({ data: { id, status: "done" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Marcada como concluída");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      toast.success("Excluída");
    },
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title: newTitle.trim(),
          estimated_minutes: 30,
          scheduled_day: today,
          priority: "medium",
          inbox: true,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["inbox"] });
      setNewTitle("");
      setNewOpen(false);
      toast.success("Adicionada à Inbox");
    },
    onError: () => toast.error("Falha ao criar"),
  });

  // Atalho "i" — abre o campo de captura rápida da Inbox.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField =
        t &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (inField) return;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        setNewOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openEdit = (t: InboxTask) => {
    setEditing(t);
    setDialogOpen(true);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <InboxIcon className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold tracking-tight">Inbox</h1>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
        <span className="ml-auto text-[11px] text-muted-foreground">
          Capture agora, decida o quando depois · atalho <kbd className="rounded border border-border bg-muted px-1 py-px text-[10px]">i</kbd>
        </span>
      </header>

      <div className="flex flex-col gap-3 p-6">
        {newOpen ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newTitle.trim() && !createMut.isPending) createMut.mutate();
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setNewOpen(false);
                  setNewTitle("");
                }
              }}
              placeholder="Capturar tarefa…"
              className="flex-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              maxLength={280}
            />
            <Button type="submit" size="sm" disabled={!newTitle.trim() || createMut.isPending}>
              Adicionar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setNewOpen(false);
                setNewTitle("");
              }}
            >
              Cancelar
            </Button>
          </form>
        ) : (
          <Button size="sm" className="self-start" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova na Inbox
          </Button>
        )}

        {isLoading && (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        )}

        {!isLoading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
            <InboxIcon className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Inbox vazia</p>
            <p className="text-xs text-muted-foreground">
              Capture ideias e tarefas sem precisar definir um dia agora.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-1.5">
          {items.map((t) => (
            <InboxRow
              key={t.id}
              task={t}
              busy={scheduleMut.isPending && scheduleMut.variables?.id === t.id}
              onSchedule={(day) => scheduleMut.mutate({ id: t.id, day })}
              onComplete={() => completeMut.mutate(t.id)}
              onDelete={() => deleteMut.mutate(t.id)}
              onEdit={() => openEdit(t)}
            />
          ))}
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

function InboxRow({
  task,
  busy,
  onSchedule,
  onComplete,
  onDelete,
  onEdit,
}: {
  task: InboxTask;
  busy: boolean;
  onSchedule: (day: string) => void;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cursor, setCursor] = useState(new Date());
  const navigate = useNavigate();

  const quick = useMemo(() => {
    const today = new Date();
    return [
      { label: "Hoje", day: isoDay(today) },
      { label: "Amanhã", day: isoDay(addDays(today, 1)) },
      { label: "Próxima semana", day: isoDay(addDays(today, 7)) },
    ];
  }, []);

  return (
    <li className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40">
      <button
        onClick={onComplete}
        title="Concluir"
        aria-label="Concluir tarefa"
        className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40 transition-colors hover:border-primary"
      />
      <button
        onClick={onEdit}
        className="min-w-0 flex-1 text-left"
        title="Editar"
      >
        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
        {task.description && (
          <p className="truncate text-[11px] text-muted-foreground">
            {task.description}
          </p>
        )}
      </button>

      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          priorityChip[task.priority],
        )}
      >
        {priorityLabel[task.priority]}
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {task.estimated_minutes}m
      </span>

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            disabled={busy}
          >
            <CalendarIcon className="h-3 w-3" />
            Agendar
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[280px] p-0">
          <div className="flex flex-col gap-1 border-b border-border p-2">
            {quick.map((q) => (
              <button
                key={q.day}
                onClick={() => {
                  onSchedule(q.day);
                  setPickerOpen(false);
                }}
                className="rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
              >
                {q.label}{" "}
                <span className="text-muted-foreground">
                  {format(new Date(q.day + "T00:00:00"), "EEE d MMM")}
                </span>
              </button>
            ))}
          </div>
          <MiniCalendar
            selected={new Date()}
            onSelect={(d) => {
              onSchedule(isoDay(d));
              setPickerOpen(false);
            }}
            cursor={cursor}
            onCursorChange={setCursor}
          />
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-muted-foreground"
            aria-label="Mais ações"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="mr-2 h-3.5 w-3.5" /> Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onComplete}>
            <CheckCircle2 className="mr-2 h-3.5 w-3.5" /> Concluir
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => navigate({ to: "/app/week" })}
          >
            <CalendarIcon className="mr-2 h-3.5 w-3.5" /> Abrir semana
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={onDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
