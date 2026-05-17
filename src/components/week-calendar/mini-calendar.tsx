import { useMemo } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface MiniCalendarProps {
  selected: Date;
  onSelect: (d: Date) => void;
  cursor: Date;
  onCursorChange: (d: Date) => void;
}

export function MiniCalendar({ selected, onSelect, cursor, onCursorChange }: MiniCalendarProps) {
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfMonth(cursor);
    const out: Date[] = [];
    let d = start;
    while (d <= end || out.length % 7 !== 0) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [cursor]);

  const today = new Date();

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onCursorChange(addMonths(cursor, -1))}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold capitalize">{format(cursor, "MMMM yyyy")}</span>
        <button
          onClick={() => onCursorChange(addMonths(cursor, 1))}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground">
        {["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const inMonth = isSameMonth(d, cursor);
          const isSelected = isSameDay(d, selected);
          const inSelectedWeek = isSameWeek(d, selected, { weekStartsOn: 1 });
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              onClick={() => onSelect(d)}
              className={cn(
                "relative h-7 rounded-md text-[11px] tabular-nums transition-colors",
                !inMonth && "text-muted-foreground/40",
                inMonth && !isSelected && "text-foreground hover:bg-accent",
                inSelectedWeek && !isSelected && "bg-primary/10",
                isSelected && "bg-primary font-semibold text-primary-foreground",
                isToday && !isSelected && "ring-1 ring-primary/60",
              )}
            >
              {format(d, "d")}
            </button>
          );
        })}
      </div>
    </div>
  );
}
