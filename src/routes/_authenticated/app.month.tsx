import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { listMonthData } from "@/lib/tasks.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/month")({
  component: MonthPage,
  head: () => ({ meta: [{ title: "Mês — FocusQueue" }] }),
});

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function MonthPage() {
  const navigate = useNavigate();
  const [cursor, setCursor] = useState(() => new Date());

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfMonth(cursor);
    const out: Date[] = [];
    let d = start;
    while (d <= end || out.length % 7 !== 0) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cursor]);

  const from = useMemo(() => isoDay(gridDays[0]), [gridDays]);
  const to = useMemo(() => isoDay(gridDays[gridDays.length - 1]), [gridDays]);

  const fetchMonth = useServerFn(listMonthData);
  const { data } = useQuery({
    queryKey: ["month", from, to],
    queryFn: () => fetchMonth({ data: { from, to } }),
  });

  const tasksByDay = useMemo(() => {
    const map = new Map<string, { id: string; category_id: string | null; status: string }[]>();
    for (const t of data?.tasks ?? []) {
      const arr = map.get(t.scheduled_day) ?? [];
      arr.push(t);
      map.set(t.scheduled_day, arr);
    }
    return map;
  }, [data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of data?.events ?? []) {
      const day = format(new Date(e.starts_at), "yyyy-MM-dd");
      map.set(day, (map.get(day) ?? 0) + 1);
    }
    return map;
  }, [data]);

  const categoryColor = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of data?.categories ?? []) m.set(c.id, c.color);
    return m;
  }, [data]);

  const today = new Date();

  const goToWeek = (d: Date) => {
    navigate({ to: "/app/week", search: { day: isoDay(d) } });
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold capitalize tracking-tight">
            {format(cursor, "MMMM yyyy")}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor((c) => addMonths(c, -1))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursor((c) => addMonths(c, 1))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-7 border-b border-border bg-background/85 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="border-r border-border px-2 py-2 last:border-r-0">
            {d}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${gridDays.length / 7}, minmax(0, 1fr))` }}
      >
        {gridDays.map((d) => {
          const iso = isoDay(d);
          const inMonth = isSameMonth(d, cursor);
          const isToday = isSameDay(d, today);
          const tasks = tasksByDay.get(iso) ?? [];
          const eventCount = eventsByDay.get(iso) ?? 0;
          const pendingCount = tasks.filter((t) => t.status !== "done").length;
          const dotColors = Array.from(
            new Set(
              tasks
                .map((t) => (t.category_id ? categoryColor.get(t.category_id) : null))
                .filter((c): c is string => Boolean(c)),
            ),
          ).slice(0, 4);

          return (
            <button
              key={iso}
              onClick={() => goToWeek(d)}
              className={cn(
                "group flex flex-col gap-2 border-b border-r border-border p-2 text-left transition-colors hover:bg-accent/40",
                !inMonth && "bg-muted/20 text-muted-foreground/60",
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isToday && "bg-primary text-primary-foreground",
                    !isToday && inMonth && "text-foreground",
                  )}
                >
                  {format(d, "d")}
                </span>
                {eventCount > 0 && (
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-secondary-foreground">
                    {eventCount} ev
                  </span>
                )}
              </div>

              {pendingCount > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {pendingCount} {pendingCount === 1 ? "tarefa" : "tarefas"}
                </span>
              )}

              {dotColors.length > 0 && (
                <div className="mt-auto flex items-center gap-1">
                  {dotColors.map((c, i) => (
                    <span
                      key={i}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
