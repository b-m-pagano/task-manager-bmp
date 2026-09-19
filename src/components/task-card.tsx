import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable visual primitive for tasks across the app.
 * Pure presentation — no DnD, no data fetching.
 * The Week view has its own enhanced version with DnD; this is for Dashboard,
 * Inbox, Today, Tasks and Projects screens.
 */
export interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  done?: boolean;
  startLabel?: string;
  endLabel?: string;
  minutes?: number;
  categoryName?: string;
  categoryColor?: string;
  onToggleDone?: () => void;
}

export const TaskCard = React.forwardRef<HTMLDivElement, TaskCardProps>(
  (
    {
      title,
      done,
      startLabel,
      endLabel,
      minutes,
      categoryName,
      categoryColor,
      onToggleDone,
      className,
      ...rest
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "group relative flex items-start gap-2 overflow-hidden rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-sm transition-shadow hover:shadow-md",
          done && "opacity-50",
          className,
        )}
        {...rest}
      >
        {categoryColor && (
          <div
            className="absolute left-0 top-0 h-full w-[3px]"
            style={{ backgroundColor: categoryColor }}
          />
        )}
        <button
          onClick={onToggleDone}
          aria-label={done ? "Marcar como pendente" : "Marcar como concluída"}
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 transition-all",
            done
              ? "border-primary bg-primary"
              : "border-muted-foreground/40 hover:scale-110 hover:border-primary",
          )}
        />
        <div className="min-w-0 flex-1 pl-1">
          <p
            className={cn(
              "font-medium leading-snug",
              done ? "text-muted-foreground line-through" : "text-foreground",
            )}
          >
            {title}
          </p>
          {(startLabel || minutes || categoryName) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] tabular-nums text-muted-foreground">
              {startLabel && endLabel && (
                <span className="font-medium">
                  {startLabel}–{endLabel}
                </span>
              )}
              {minutes != null && (
                <>
                  {startLabel && <span>·</span>}
                  <span>{minutes}m</span>
                </>
              )}
              {categoryName && (
                <>
                  <span>·</span>
                  <span className="font-medium" style={{ color: categoryColor }}>
                    {categoryName}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);
TaskCard.displayName = "TaskCard";
