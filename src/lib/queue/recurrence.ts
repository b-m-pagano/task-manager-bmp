import { addDays, addMonths, format, parseISO, isAfter } from "date-fns";

export type RecurrenceFreq = "daily" | "weekly" | "biweekly" | "monthly" | "custom";
export type CustomUnit = "day" | "week" | "month";

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  interval?: number; // for custom
  unit?: CustomUnit; // for custom
  byweekday?: number[]; // 0=Sun..6=Sat (used by weekly/biweekly/custom-week)
  until?: string | null; // yyyy-MM-dd inclusive
}

const MAX_OCCURRENCES = 365;

/**
 * Expand a recurrence rule starting at `startDay` (yyyy-MM-dd).
 * Returns an ordered list of yyyy-MM-dd strings, including the start day.
 */
export function expandRecurrence(startDay: string, rule: RecurrenceRule): string[] {
  const start = parseISO(startDay);
  const until = rule.until ? parseISO(rule.until) : addMonths(start, 3);
  const out: string[] = [];

  const push = (d: Date) => {
    if (isAfter(d, until)) return false;
    out.push(format(d, "yyyy-MM-dd"));
    return out.length < MAX_OCCURRENCES;
  };

  const weekdays = rule.byweekday && rule.byweekday.length > 0 ? [...rule.byweekday].sort() : null;

  if (rule.freq === "daily") {
    let d = start;
    while (push(d)) d = addDays(d, 1);
    return out;
  }

  if (rule.freq === "weekly" || rule.freq === "biweekly") {
    const stepWeeks = rule.freq === "biweekly" ? 2 : 1;
    const days = weekdays ?? [start.getDay()];
    // Walk week by week from start, picking each selected weekday on/after start.
    let weekStart = startOfWeekSun(start);
    while (true) {
      let advanced = false;
      for (const wd of days) {
        const d = addDays(weekStart, wd);
        if (d < start) continue;
        advanced = true;
        if (!push(d)) return out;
      }
      // Stop if we're past `until` and didn't push anything this week
      if (!advanced && isAfter(weekStart, until)) break;
      weekStart = addDays(weekStart, 7 * stepWeeks);
      if (isAfter(weekStart, addDays(until, 7))) break;
    }
    return out;
  }

  if (rule.freq === "monthly") {
    let d = start;
    while (push(d)) d = addMonths(d, 1);
    return out;
  }

  if (rule.freq === "custom") {
    const interval = Math.max(1, rule.interval ?? 1);
    const unit = rule.unit ?? "day";
    if (unit === "week" && weekdays) {
      let weekStart = startOfWeekSun(start);
      while (true) {
        let advanced = false;
        for (const wd of weekdays) {
          const d = addDays(weekStart, wd);
          if (d < start) continue;
          advanced = true;
          if (!push(d)) return out;
        }
        if (!advanced && isAfter(weekStart, until)) break;
        weekStart = addDays(weekStart, 7 * interval);
        if (isAfter(weekStart, addDays(until, 7))) break;
      }
      return out;
    }
    let d = start;
    while (push(d)) {
      if (unit === "day") d = addDays(d, interval);
      else if (unit === "week") d = addDays(d, 7 * interval);
      else d = addMonths(d, interval);
    }
    return out;
  }

  return out;
}

function startOfWeekSun(d: Date): Date {
  return addDays(d, -d.getDay());
}

export function defaultUntilFor(startDay: string): string {
  return format(addMonths(parseISO(startDay), 3), "yyyy-MM-dd");
}
