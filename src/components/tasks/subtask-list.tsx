import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listSubtasks, createTask, updateTask, deleteTask } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

interface SubtaskListProps {
  parentId: string;
  parentScheduledDay: string;
  onOpenSubtask: (id: string) => void;
}

export function SubtaskList({ parentId, parentScheduledDay, onOpenSubtask }: SubtaskListProps) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSubtasks);
  const createFn = useServerFn(createTask);
  const updateFn = useServerFn(updateTask);
  const deleteFn = useServerFn(deleteTask);
  const [newTitle, setNewTitle] = useState("");

  const { data: subtasks = [] } = useQuery({
    queryKey: ["subtasks", parentId],
    queryFn: () => listFn({ data: { parent_id: parentId } }),
  });

  const createMut = useMutation({
    mutationFn: (title: string) =>
      createFn({
        data: {
          title,
          parent_id: parentId,
          scheduled_day: parentScheduledDay,
          estimated_minutes: 15,
          priority: "medium",
        },
      }),
    onSuccess: () => {
      setNewTitle("");
      qc.invalidateQueries({ queryKey: ["subtasks", parentId] });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
    onError: (err) => toast.error("Falha ao criar", { description: String(err) }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "pending" | "done" }) =>
      updateFn({ data: { id, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", parentId] });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subtasks", parentId] });
      qc.invalidateQueries({ queryKey: ["week"] });
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      {subtasks.map((s) => {
        const done = s.status === "done";
        return (
          <div
            key={s.id}
            className="group flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-sm transition-colors hover:border-primary/40"
          >
            <button
              onClick={() => toggleMut.mutate({ id: s.id, status: done ? "pending" : "done" })}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-muted-foreground/40 hover:border-primary",
              )}
              aria-label={done ? "Marcar pendente" : "Concluir"}
            >
              {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            </button>
            <button
              onClick={() => onOpenSubtask(s.id)}
              className={cn(
                "min-w-0 flex-1 truncate text-left",
                done && "text-muted-foreground line-through",
              )}
              title="Abrir subtarefa"
            >
              {s.title}
            </button>
            <span className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline">
              {s.estimated_minutes}m
            </span>
            <button
              onClick={() => deleteMut.mutate(s.id)}
              className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              aria-label="Excluir subtarefa"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) createMut.mutate(newTitle.trim());
        }}
        className="flex items-center gap-2 rounded-md border border-dashed border-border px-2 py-1.5"
      >
        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Adicionar subtarefa…"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        />
      </form>
    </div>
  );
}
