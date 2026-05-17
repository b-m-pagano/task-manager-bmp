import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";

import { WeekHeader } from "@/components/week-calendar/week-header";
import { MiniCalendar } from "@/components/week-calendar/mini-calendar";
import {
  DayColumnGrid,
  GRID_HEIGHT,
  HourGutter,
  PX_PER_HOUR,
  DAY_START_HOUR,
} from "@/components/week-calendar/time-grid";
import { EventCard } from "@/components/week-calendar/event-card";
import { CurrentTimeIndicator } from "@/components/week-calendar/current-time-indicator";
import { buildMockEvents, mockCategories, mockProjects } from "@/lib/mock/week-mock";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/week")({
  component: WeekPage,
  head: () => ({ meta: [{ title: "Semana — FocusQueue" }] }),
});

function WeekPage() {
  const [selected, setSelected] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date());

  const weekStart = useMemo(() => startOfWeek(selected, { weekStartsOn: 1 }), [selected]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const events = useMemo(() => buildMockEvents(selected), [selected]);
  const categoryById = useMemo(
    () => Object.fromEntries(mockCategories.map((c) => [c.id, c])),
    [],
  );
  const projectById = useMemo(
    () => Object.fromEntries(mockProjects.map((p) => [p.id, p])),
    [],
  );

  // Auto-scroll to ~current time (or 08:00) on mount
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const target = Math.max(0, (minutes - DAY_START_HOUR * 60 - 60) * (PX_PER_HOUR / 60));
    scrollRef.current.scrollTop = target;
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WeekHeader
        weekStart={weekStart}
        weekEnd={days[6]}
        onPrev={() => setSelected((d) => addDays(d, -7))}
        onNext={() => setSelected((d) => addDays(d, 7))}
        onToday={() => {
          setSelected(new Date());
          setCursor(new Date());
        }}
      />

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border bg-card/40 lg:flex">
          <MiniCalendar
            selected={selected}
            onSelect={setSelected}
            cursor={cursor}
            onCursorChange={setCursor}
          />
          <div className="border-t border-border p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Categorias
            </p>
            <ul className="space-y-1.5">
              {mockCategories.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="text-foreground">{c.name}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Calendar */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Day headers */}
          <div className="flex border-b border-border bg-background/85 backdrop-blur">
            <div className="w-16 shrink-0" />
            {days.map((d) => {
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={d.toISOString()}
                  className={cn(
                    "flex flex-1 flex-col items-center gap-0.5 border-r border-border py-2 last:border-r-0",
                  )}
                >
                  <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {format(d, "EEE")}
                  </span>
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      isToday
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {format(d, "d")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable grid */}
          <div ref={scrollRef} className="relative flex-1 overflow-auto">
            <div className="flex" style={{ minHeight: GRID_HEIGHT }}>
              <HourGutter />
              {days.map((d) => {
                const iso = d.toISOString().slice(0, 10);
                const isToday = isSameDay(d, new Date());
                const dayWeekday = d.getDay();
                const isWeekend = dayWeekday === 0 || dayWeekday === 6;
                const dayEvents = events.filter((e) => e.day === iso);
                return (
                  <DayColumnGrid key={iso} isToday={isToday} isWeekend={isWeekend}>
                    {dayEvents.map((ev) => (
                      <EventCard
                        key={ev.id}
                        event={ev}
                        category={categoryById[ev.categoryId]}
                        project={ev.projectId ? projectById[ev.projectId] : undefined}
                      />
                    ))}
                    {isToday && <CurrentTimeIndicator />}
                  </DayColumnGrid>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
