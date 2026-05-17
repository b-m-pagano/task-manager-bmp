import { addDays, format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface WeekHeaderProps {
  weekStart: Date;
  weekEnd: Date;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function WeekHeader({ weekStart, weekEnd, onPrev, onNext, onToday }: WeekHeaderProps) {
  void addDays;
  return (
    <header className="flex items-center gap-3 border-b border-border px-6 py-3">
      <h1 className="text-base font-semibold tracking-tight">Semana</h1>
      <div className="ml-2 flex items-center gap-1">
        <button
          onClick={onPrev}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={onToday}
          className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Hoje
        </button>
        <button
          onClick={onNext}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          aria-label="Próxima semana"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <span className="text-xs text-muted-foreground">
        {format(weekStart, "d MMM")} – {format(weekEnd, "d MMM yyyy")}
      </span>
    </header>
  );
}
