import { addDays, startOfWeek, format } from "date-fns";

export function weekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function isoDay(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

export function dayLabel(d: Date): string {
  return format(d, "EEE d/MM");
}
