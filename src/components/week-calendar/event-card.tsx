import * as React from "react";
import { cn } from "@/lib/utils";
import { minuteToTop, PX_PER_MIN } from "./time-grid";
import type { MockCategory, MockEvent, MockProject } from "@/lib/mock/week-mock";
import { AlertTriangle, CheckCircle2, Circle, CircleDot, Flag } from "lucide-react";

interface EventCardProps {
  event: MockEvent;
  category?: MockCategory;
  project?: MockProject;
  onToggleStatus?: () => void;
  isTogglingStatus?: boolean;
}

const priorityRing: Record<MockEvent["priority"], string> = {
  low: "",
  medium: "",
  high: "ring-1 ring-amber-400/40",
  urgent: "ring-1 ring-destructive/60",
};

const priorityIcon: Record<MockEvent["priority"], React.ReactNode> = {
  low: null,
  medium: null,
  high: <Flag className="h-2.5 w-2.5 text-amber-500" />,
  urgent: <AlertTriangle className="h-2.5 w-2.5 text-destructive" />,
};

const statusIcon: Record<MockEvent["status"], React.ReactNode> = {
  pending: <Circle className="h-3 w-3 text-muted-foreground/50" />,
  doing: <CircleDot className="h-3 w-3 text-primary" />,
  done: <CheckCircle2 className="h-3 w-3 text-now" />,
};

function fmt(minute: number) {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function EventCard({ event, category, project, onToggleStatus, isTogglingStatus }: EventCardProps) {
  const top = minuteToTop(event.startMinute);
  const height = Math.max(28, event.durationMinutes * PX_PER_MIN - 2);
  const compact = height < 44;
  const isDone = event.status === "done";

  const tint = category?.color ?? "oklch(0.7 0.05 260)";

  if (event.external) {
    return (
      <div
        className="absolute inset-x-1 overflow-hidden rounded-md border border-dashed border-event-foreground/30 bg-event/70 px-2 py-1 text-[10px] text-event-foreground backdrop-blur-sm"
        style={{ top, height }}
      >
        <p className="truncate font-medium">{event.title}</p>
        <p className="mt-0.5 tabular-nums opacity-70">
          {fmt(event.startMinute)}–{fmt(event.startMinute + event.durationMinutes)}
        </p>
      </div>
    );
  }

  const AFTER_HOURS = 18 * 60;
  const endMinute = event.startMinute + event.durationMinutes;
  const startsAfterHours = !isDone && event.startMinute >= AFTER_HOURS;
  const endsAfterHours = !isDone && endMinute > AFTER_HOURS && event.startMinute < AFTER_HOURS;
  const isAfterHours = startsAfterHours || endsAfterHours;
  const afterHoursTitle = startsAfterHours
    ? "Tarefa começa após 18h"
    : "Tarefa termina após 18h";

  return (
    <div
      className={cn(
        "group absolute inset-x-1 flex flex-col overflow-hidden rounded-md border border-border bg-card text-[11px] shadow-sm transition-[box-shadow,transform,top,height] duration-200 ease-out hover:z-10 hover:shadow-md",
        isDone && "opacity-55",
        isAfterHours && "ring-1 ring-after-hours/60",
        priorityRing[event.priority],
      )}
      style={{
        top,
        height,
        backgroundColor: isDone
          ? undefined
          : `color-mix(in oklab, ${tint} 10%, var(--card))`,
      }}
    >
      <div className="absolute left-0 top-0 h-full w-[3px]" style={{ backgroundColor: tint }} />
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 py-1 pl-2.5">
        <div className="flex items-start gap-1">
          {onToggleStatus ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleStatus();
              }}
              className="mt-px shrink-0 rounded-full transition-transform hover:scale-110"
              aria-label={isDone ? "Marcar como pendente" : "Marcar como concluída"}
              title={isDone ? "Marcar como pendente" : "Concluir"}
            >
              {statusIcon[event.status]}
            </button>
          ) : (
            <span className="mt-px shrink-0">{statusIcon[event.status]}</span>
          )}
          <p
            className={cn(
              "min-w-0 flex-1 truncate font-medium leading-tight",
              isDone ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {event.title}
          </p>
          {isAfterHours && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-sm bg-after-hours/15 px-1 py-px text-[8.5px] font-semibold uppercase tracking-wide text-after-hours"
              title={afterHoursTitle}
            >
              <AlertTriangle className="h-2.5 w-2.5" />
              <span>após 18h</span>
            </span>
          )}
          {priorityIcon[event.priority] && <span className="shrink-0">{priorityIcon[event.priority]}</span>}
        </div>
        {!compact && (
          <div className="flex flex-wrap items-center gap-x-1 gap-y-0 text-[9.5px] tabular-nums text-muted-foreground">
            <span className="font-medium">
              {fmt(event.startMinute)}–{fmt(event.startMinute + event.durationMinutes)}
            </span>
            <span>·</span>
            <span>{event.durationMinutes}m</span>
          </div>
        )}
        {!compact && (category || project) && (
          <div className="mt-auto flex flex-wrap items-center gap-x-1.5 text-[9.5px] leading-none">
            {category && (
              <span className="font-medium" style={{ color: tint }}>
                {category.name}
              </span>
            )}
            {project && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="truncate text-muted-foreground">{project.name}</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
