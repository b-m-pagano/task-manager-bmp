/**
 * Browser-side timezone helpers. The TanStack server runs in UTC, so the
 * client must always tell the server its local offset when persisting a
 * timestamp built from a wall-clock day + minute.
 */
export function getLocalTzOffsetMinutes(): number {
  // Date#getTimezoneOffset() returns minutes WEST of UTC (BRT = +180).
  // Invert so positive = east of UTC, matching ISO offsets ("+03:00" = +180).
  return -new Date().getTimezoneOffset();
}

export function formatTzOffset(min: number): string {
  const sign = min >= 0 ? "+" : "-";
  const abs = Math.abs(min);
  const h = String(Math.floor(abs / 60)).padStart(2, "0");
  const m = String(abs % 60).padStart(2, "0");
  return `${sign}${h}:${m}`;
}
