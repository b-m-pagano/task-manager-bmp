import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable 7-column weekly grid skeleton.
 * Pure layout primitive — children render the contents of each day column.
 */
export interface CalendarGridProps extends React.HTMLAttributes<HTMLDivElement> {
  days: Date[];
  renderDay: (day: Date, index: number) => React.ReactNode;
  renderDayHeader?: (day: Date, index: number) => React.ReactNode;
}

export function CalendarGrid({ days, renderDay, renderDayHeader, className, ...rest }: CalendarGridProps) {
  return (
    <div className={cn("grid flex-1 grid-cols-7 overflow-auto", className)} {...rest}>
      {days.map((day, i) => (
        <div key={day.toISOString()} className="flex min-w-0 flex-col border-r border-border last:border-r-0">
          {renderDayHeader && (
            <div className="sticky top-0 z-10 border-b border-border bg-background/85 px-3 py-2 backdrop-blur">
              {renderDayHeader(day, i)}
            </div>
          )}
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-2">{renderDay(day, i)}</div>
        </div>
      ))}
    </div>
  );
}
