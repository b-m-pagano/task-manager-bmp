import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Pure visual grid: hour rows (00h → 24h) × N day columns.
 * The 08h–18h band is the functional/work zone (highlighted).
 * Hours outside the work zone are dimmed but still navigable.
 * Children render absolutely-positioned cards on top.
 */

// Visual grid spans the full day.
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;

// Functional work zone — used for highlighting and as the default
// scheduling anchor (see `WORK_START_HOUR` consumers).
export const WORK_START_HOUR = 8;
export const WORK_END_HOUR = 18;

export const PX_PER_HOUR = 44;
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
      {hours.map((h) => {
        const inWork = h >= WORK_START_HOUR && h <= WORK_END_HOUR;
        return (
          <div
            key={h}
            className={cn(
              "absolute right-2 -translate-y-1/2 text-[10px] tabular-nums",
              inWork
                ? "font-semibold text-foreground/80"
                : "font-medium text-muted-foreground/45",
            )}
            style={{ top: (h - DAY_START_HOUR) * PX_PER_HOUR }}
          >
            {String(h).padStart(2, "0")}:00
          </div>
        );
      })}
    </div>
  );
}

export interface DayColumnGridProps {
  isToday?: boolean;
  isWeekend?: boolean;
  children?: React.ReactNode;
}

/** Single day column body — draws hour lines + dims off-work hours. */
export const DayColumnGrid = React.forwardRef<HTMLDivElement, DayColumnGridProps>(
  function DayColumnGrid({ isToday, isWeekend, children }, ref) {
    const lines = Array.from({ length: TOTAL_HOURS }, (_, i) => i);

    const preWorkTop = (DAY_START_HOUR - DAY_START_HOUR) * PX_PER_HOUR;
    const preWorkHeight = (WORK_START_HOUR - DAY_START_HOUR) * PX_PER_HOUR;
    const workTop = (WORK_START_HOUR - DAY_START_HOUR) * PX_PER_HOUR;
    const workHeight = (WORK_END_HOUR - WORK_START_HOUR) * PX_PER_HOUR;
    const postWorkTop = (WORK_END_HOUR - DAY_START_HOUR) * PX_PER_HOUR;
    const postWorkHeight = (DAY_END_HOUR - WORK_END_HOUR) * PX_PER_HOUR;

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex-1 border-r border-border last:border-r-0",
          isToday && "bg-primary/[0.025]",
          isWeekend && !isToday && "bg-muted/30",
        )}
        style={{ height: GRID_HEIGHT, minWidth: 0 }}
      >
        {/* off-hours bands (00–08 and 18–24) — dimmed */}
        <div
          className="pointer-events-none absolute inset-x-0 bg-muted/40"
          style={{ top: preWorkTop, height: preWorkHeight }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bg-after-hours/[0.07]"
          style={{ top: postWorkTop, height: postWorkHeight }}
        />
        {/* work band (08–18) — subtle highlight + bordered framing */}
        <div
          className="pointer-events-none absolute inset-x-0 border-y border-primary/20 bg-background"
          style={{ top: workTop, height: workHeight }}
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
  },
);
