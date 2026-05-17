import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pure visual grid: hour rows (08h → 23h) × N day columns.
 * Children render absolutely-positioned cards on top.
 */

export const DAY_START_HOUR = 8;
export const DAY_END_HOUR = 23;
export const AFTER_HOURS_HOUR = 18;
export const PX_PER_HOUR = 56;
export const PX_PER_MIN = PX_PER_HOUR / 60;
export const TOTAL_HOURS = DAY_END_HOUR - DAY_START_HOUR;
export const GRID_HEIGHT = TOTAL_HOURS * PX_PER_HOUR;

const GUTTER_PX = 64;

export function minuteToTop(minute: number): number {
  return (minute - DAY_START_HOUR * 60) * PX_PER_MIN;
}

export function HourGutter() {
  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => DAY_START_HOUR + i);
  return (
    <div className="relative shrink-0" style={{ width: GUTTER_PX, height: GRID_HEIGHT }}>
      {hours.map((h) => (
        <div
          key={h}
          className="absolute right-2 -translate-y-1/2 text-[10px] font-medium tabular-nums text-muted-foreground/70"
          style={{ top: (h - DAY_START_HOUR) * PX_PER_HOUR }}
        >
          {String(h).padStart(2, "0")}:00
        </div>
      ))}
    </div>
  );
}

export interface DayColumnGridProps {
  isToday?: boolean;
  isWeekend?: boolean;
  children?: React.ReactNode;
}

/** Single day column body — draws horizontal hour lines + after-hours band. */
export function DayColumnGrid({ isToday, isWeekend, children }: DayColumnGridProps) {
  const lines = Array.from({ length: TOTAL_HOURS }, (_, i) => i);
  const afterHoursTop = (AFTER_HOURS_HOUR - DAY_START_HOUR) * PX_PER_HOUR;
  const afterHoursHeight = (DAY_END_HOUR - AFTER_HOURS_HOUR) * PX_PER_HOUR;

  return (
    <div
      className={cn(
        "relative flex-1 border-r border-border last:border-r-0",
        isToday && "bg-primary/[0.025]",
        isWeekend && !isToday && "bg-muted/30",
      )}
      style={{ height: GRID_HEIGHT, minWidth: 0 }}
    >
      {/* after-hours band */}
      <div
        className="pointer-events-none absolute inset-x-0 bg-after-hours/[0.06]"
        style={{ top: afterHoursTop, height: afterHoursHeight }}
      />
      {/* hour lines */}
      {lines.map((i) => (
        <div
          key={i}
          className="pointer-events-none absolute inset-x-0 border-t border-border/60"
          style={{ top: i * PX_PER_HOUR }}
        />
      ))}
      {/* half-hour lines (subtle) */}
      {lines.map((i) => (
        <div
          key={`h-${i}`}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/30"
          style={{ top: i * PX_PER_HOUR + PX_PER_HOUR / 2 }}
        />
      ))}
      {children}
    </div>
  );
}
