import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  Check,
  Filter,
  Search,
  X,
  Loader2,
  CheckCircle2,
  Circle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { listTasks } from "@/lib/tasks.functions";
import { TaskDialog, type TaskDialogTask } from "@/components/tasks/task-dialog";

type Scope = "todo" | "done" | "all";
type Priority = "low" | "medium" | "high" | "urgent";

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

interface Filters {
  scope: Scope;
  search: string;
  categoryIds: string[];
  projectIds: string[];
  priorities: Priority[];
  createdFrom?: string;
  createdTo?: string;
  completedFrom?: string;
  completedTo?: string;
  scheduledFrom?: string;
  scheduledTo?: string;
}

const initialFilters: Filters = {
  scope: "todo",
  search: "",
  categoryIds: [],
  projectIds: [],
  priorities: [],
};

export const Route = createFileRoute("/_authenticated/app/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tarefas — FocusQueue" }] }),
});

function TasksPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [limit, setLimit] = useState(50);
  const [editing, setEditing] = useState<TaskDialogTask | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const queryInput = useMemo(
    () => ({
      ...filters,
      search: filters.search.trim() || undefined,
      categoryIds: filters.categoryIds.length ? filters.categoryIds : undefined,
      projectIds: filters.projectIds.length ? filters.projectIds : undefined,
      priorities: filters.priorities.length ? filters.priorities : undefined,
      limit,
      offset: 0,
    }),
    [filters, limit],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["tasks", "list", queryInput],
    queryFn: () => listFn({ data: queryInput }),
  });

  const tasks = data?.tasks ?? [];
  const categories = data?.categories ?? [];
  const projects = data?.projects ?? [];
  const total = data?.total ?? 0;

  const grouped = useMemo(() => {
    const dateField = filters.scope === "done" ? "completed_at" : "scheduled_day";
    const map = new Map<string, typeof tasks>();
    for (const t of tasks) {
      const raw = (t as any)[dateField];
      const key = raw ? String(raw).slice(0, 10) : "—";
      if (!map.has(key)) map.set(key, [] as typeof tasks);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [tasks, filters.scope]);

  const activeFilterCount =
    filters.categoryIds.length +
    filters.projectIds.length +
    filters.priorities.length +
    (filters.createdFrom || filters.createdTo ? 1 : 0) +
    (filters.completedFrom || filters.completedTo ? 1 : 0) +
    (filters.scheduledFrom || filters.scheduledTo ? 1 : 0);

  function clearFilters() {
    setFilters({ ...initialFilters, scope: filters.scope, search: filters.search });
  }

  function openTask(t: any) {
    setEditing({
      id: t.id,
      title: t.title,
      description: t.description,
      notes: t.notes,
      estimated_minutes: t.estimated_minutes,
      priority: t.priority,
      status: t.status,
      category_id: t.category_id,
      project_id: t.project_id,
      scheduled_day: t.scheduled_day,
      scheduled_start: t.scheduled_start,
      due_date: t.due_date,
      parent_id: t.parent_id,
      series_id: t.series_id,
    });
    setDialogOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-base font-semibold tracking-tight">Tarefas</h1>
          <Tabs
            value={filters.scope}
            onValueChange={(v) => setFilters((f) => ({ ...f, scope: v as Scope }))}
          >
            <TabsList>
              <TabsTrigger value="todo">A fazer</TabsTrigger>
              <TabsTrigger value="done">Concluídas</TabsTrigger>
              <TabsTrigger value="all">Todas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Buscar por título ou descrição…"
              className="pl-8"
            />
          </div>

          <MultiSelectFilter
            label="Categoria"
            options={[
              { id: "none", name: "Sem categoria", color: "#94a3b8" },
              ...categories.map((c: any) => ({ id: c.id, name: c.name, color: c.color })),
            ]}
            selected={filters.categoryIds}
            onChange={(ids) => setFilters((f) => ({ ...f, categoryIds: ids }))}
          />

          <MultiSelectFilter
            label="Projeto"
            options={[
              { id: "none", name: "Sem projeto", color: "#94a3b8" },
              ...projects.map((p: any) => ({ id: p.id, name: p.name, color: p.color })),
            ]}
            selected={filters.projectIds}
            onChange={(ids) => setFilters((f) => ({ ...f, projectIds: ids }))}
          />

          <MultiSelectFilter
            label="Prioridade"
            options={(["urgent", "high", "medium", "low"] as Priority[]).map((p) => ({
              id: p,
              name: PRIORITY_LABEL[p],
            }))}
            selected={filters.priorities}
            onChange={(ids) => setFilters((f) => ({ ...f, priorities: ids as Priority[] }))}
          />

          <DateRangeFilter
            label="Criação"
            from={filters.createdFrom}
            to={filters.createdTo}
            onChange={(from, to) => setFilters((f) => ({ ...f, createdFrom: from, createdTo: to }))}
          />

          {(filters.scope === "done" || filters.scope === "all") && (
            <DateRangeFilter
              label="Conclusão"
              from={filters.completedFrom}
              to={filters.completedTo}
              onChange={(from, to) =>
                setFilters((f) => ({ ...f, completedFrom: from, completedTo: to }))
              }
            />
          )}

          {(filters.scope === "todo" || filters.scope === "all") && (
            <DateRangeFilter
              label="Agendada"
              from={filters.scheduledFrom}
              to={filters.scheduledTo}
              onChange={(from, to) =>
                setFilters((f) => ({ ...f, scheduledFrom: from, scheduledTo: to }))
              }
            />
          )}

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="mr-1 h-3.5 w-3.5" /> Limpar ({activeFilterCount})
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Nenhuma tarefa encontrada com esses filtros.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {grouped.map(([day, items]) => (
              <div key={day} className="px-6 py-3">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatGroupDay(day)}
                </div>
                <ul className="space-y-1">
                  {items.map((t: any) => {
                    const cat = categories.find((c: any) => c.id === t.category_id);
                    const proj = projects.find((p: any) => p.id === t.project_id);
                    const done = !!t.completed_at;
                    return (
                      <li key={t.id}>
                        <button
                          onClick={() => openTask(t)}
                          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted/60"
                        >
                          {done ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          ) : (
                            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <span
                            className={cn(
                              "flex-1 truncate text-sm",
                              done && "text-muted-foreground line-through",
                            )}
                          >
                            {t.title}
                          </span>
                          {cat && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <span
                                className="h-2 w-2 rounded-full"
                                style={{ backgroundColor: cat.color }}
                              />
                              {cat.name}
                            </span>
                          )}
                          {proj && (
                            <Badge variant="outline" className="text-xs">
                              {proj.name}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {t.estimated_minutes}min
                          </span>
                          {done && t.completed_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(t.completed_at), "HH:mm")}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            {tasks.length < total && (
              <div className="flex justify-center p-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLimit((l) => l + 50)}
                  disabled={isFetching}
                >
                  {isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                  Carregar mais ({tasks.length} de {total})
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            qc.invalidateQueries({ queryKey: ["tasks", "list"] });
          }
        }}
        task={editing}
        defaultDay={new Date().toISOString().slice(0, 10)}
        categories={categories as any}
        projects={projects as any}
      />
    </div>
  );
}

function formatGroupDay(day: string): string {
  if (day === "—") return "Sem data";
  try {
    return format(parseISO(day), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch {
    return day;
  }
}

interface MultiOption {
  id: string;
  name: string;
  color?: string;
}

function MultiSelectFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <Filter className="mr-1.5 h-3.5 w-3.5" />
          {label}
          {selected.length > 0 && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
              {selected.length}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="max-h-72 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhuma opção</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => toggle(opt.id)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  {opt.color && (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  <span className="flex-1 truncate">{opt.name}</span>
                  {checked && <Check className="h-3.5 w-3.5 text-primary" />}
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <>
            <div className="my-1 border-t border-border" />
            <button
              onClick={() => onChange([])}
              className="w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              Limpar seleção
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function DateRangeFilter({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
}) {
  const active = !!(from || to);
  const range = {
    from: from ? parseISO(from) : undefined,
    to: to ? parseISO(to) : undefined,
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {label}
          {active && (
            <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-xs">
              {from ? format(parseISO(from), "dd/MM") : "…"}
              {" – "}
              {to ? format(parseISO(to), "dd/MM") : "…"}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={range as any}
          onSelect={(r: any) => {
            onChange(
              r?.from ? format(r.from, "yyyy-MM-dd") : undefined,
              r?.to ? format(r.to, "yyyy-MM-dd") : undefined,
            );
          }}
          numberOfMonths={2}
          initialFocus
          className={cn("p-3 pointer-events-auto")}
        />
        {active && (
          <div className="border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange(undefined, undefined)}
            >
              Limpar
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
