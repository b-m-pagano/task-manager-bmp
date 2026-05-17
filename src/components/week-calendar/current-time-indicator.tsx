import { useEffect, useState } from "react";
import { DAY_END_HOUR, DAY_START_HOUR, minuteToTop } from "./time-grid";

export function CurrentTimeIndicator({ showDot = true }: { showDot?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < DAY_START_HOUR * 60 || minutes > DAY_END_HOUR * 60) return null;
  const top = minuteToTop(minutes);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
      style={{ top }}
      aria-hidden
    >
      {showDot && (
        <span className="relative -ml-1 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
        </span>
      )}
      <span className="h-px flex-1 bg-destructive" />
    </div>
  );
}
