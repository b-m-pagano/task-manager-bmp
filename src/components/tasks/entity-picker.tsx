import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { upsertCategory } from "@/lib/categories.functions";
import { upsertProject } from "@/lib/projects.functions";

export const SWATCHES = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#f97316", // orange
  "#64748b", // slate
] as const;

export type Entity = { id: string; name: string; color: string };

type EntityKind = "category" | "project";

interface EntityPickerProps {
  kind: EntityKind;
  value: string | null;
  onChange: (id: string | null) => void;
  options: Entity[];
  /** Inline trigger element. */
  trigger: React.ReactNode;
  /** Optional: notified when a new entity is just created (after mutation). */
  onCreated?: (e: Entity) => void;
}

export function EntityPicker({
  kind,
  value,
  onChange,
  options,
  trigger,
  onCreated,
}: EntityPickerProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(SWATCHES[0]);

  const upsertCatFn = useServerFn(upsertCategory);
  const upsertProjFn = useServerFn(upsertProject);

  const labels = {
    category: {
      placeholder: "Buscar categoria…",
      none: "Sem categoria",
      add: "Nova categoria",
      created: "Categoria criada",
      failed: "Falha ao criar categoria",
      invalidate: ["categories"],
    },
    project: {
      placeholder: "Buscar projeto…",
      none: "Sem projeto",
      add: "Novo projeto",
      created: "Projeto criado",
      failed: "Falha ao criar projeto",
      invalidate: ["projects"],
    },
  }[kind];

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const createMut = useMutation({
    mutationFn: async (input: { name: string; color: string }) => {
      if (kind === "category") {
        return (await upsertCatFn({
          data: { name: input.name, color: input.color, icon: "circle" },
        })) as Entity;
      }
      return (await upsertProjFn({
        data: { name: input.name, color: input.color, icon: "folder" },
      })) as Entity;
    },
    onSuccess: (row) => {
      toast.success(labels.created);
      qc.invalidateQueries({ queryKey: ["today"] });
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: labels.invalidate });
      onCreated?.(row);
      onChange(row.id);
      setCreating(false);
      setNewName("");
      setNewColor(SWATCHES[0]);
      setOpen(false);
    },
    onError: (err) => toast.error(labels.failed, { description: String(err) }),
  });

  const reset = () => {
    setQuery("");
    setCreating(false);
    setNewName("");
    setNewColor(SWATCHES[0]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {!creating ? (
          <div className="flex flex-col">
            <div className="relative border-b border-border">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={labels.placeholder}
                className="h-9 border-0 pl-8 text-sm focus-visible:ring-0"
                autoFocus
              />
            </div>

            <ul className="max-h-56 overflow-y-auto py-1">
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                    value === null && "font-medium",
                  )}
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 text-muted-foreground">{labels.none}</span>
                  {value === null && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              </li>

              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted",
                      value === o.id && "font-medium",
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: o.color }}
                    />
                    <span className="flex-1 truncate">{o.name}</span>
                    {value === o.id && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                </li>
              ))}

              {filtered.length === 0 && (
                <li className="px-3 py-2 text-xs text-muted-foreground">
                  Nenhum resultado
                </li>
              )}
            </ul>

            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setNewName(query);
              }}
              className="flex items-center gap-2 border-t border-border px-3 py-2 text-sm text-primary hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              {labels.add}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 p-3">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome"
              maxLength={80}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) {
                  e.preventDefault();
                  createMut.mutate({ name: newName.trim(), color: newColor });
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "h-6 w-6 rounded-md ring-offset-2 ring-offset-background transition-all hover:scale-110",
                    newColor === c && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Cor ${c}`}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setCreating(false)}
                disabled={createMut.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  newName.trim() &&
                  createMut.mutate({ name: newName.trim(), color: newColor })
                }
                disabled={!newName.trim() || createMut.isPending}
              >
                {createMut.isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                Criar
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
