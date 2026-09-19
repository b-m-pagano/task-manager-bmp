import { format } from "date-fns";
import { Plus, Sparkles, ArrowDownToLine, CalendarDays, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { QuickAddBar } from "@/components/tasks/quick-add-bar";
import { MiniCalendar } from "./mini-calendar";
import { AiInsightsPanel } from "./ai-insights-panel";
import { CalendarSyncButton } from "./calendar-sync-button";
import type { WeekBoard } from "./use-week-board";

function isoDay(d: Date) {
  return format(d, "yyyy-MM-dd");
}

interface WeekToolbarProps {
  onOpenCreate: () => void;
  selected: Date;
  onSelectDate: (d: Date) => void;
  cursor: Date;
  onCursorChange: (d: Date) => void;
  categories: WeekBoard["categories"];
  onReplanDay: (iso: string) => void;
  carryMut: WeekBoard["carryMut"];
  daysISO: string[];
  onSynced: () => void;
  onApplySuggestion: (taskId: string, day: string, startMinute: number) => void;
}

/** Action row above the week grid: create, date picker, legend, quick-add, replan, migrate, AI insights, calendar sync. */
export function WeekToolbar({
  onOpenCreate,
  selected,
  onSelectDate,
  cursor,
  onCursorChange,
  categories,
  onReplanDay,
  carryMut,
  daysISO,
  onSynced,
  onApplySuggestion,
}: WeekToolbarProps) {
  const selectedIso = isoDay(selected);
  return (
    <div className="flex items-center gap-3 border-b border-border px-6 py-2">
      <Button size="sm" onClick={onOpenCreate} className="shrink-0">
        <Plus className="mr-1 h-3.5 w-3.5" /> Nova tarefa
        <span className="ml-2 hidden text-[10px] opacity-60 sm:inline">N</span>
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="shrink-0" title="Escolher data">
            <CalendarDays className="mr-1 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{format(selected, "d MMM")}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[260px] p-0">
          <MiniCalendar
            selected={selected}
            onSelect={onSelectDate}
            cursor={cursor}
            onCursorChange={onCursorChange}
          />
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="ghost" className="shrink-0" title="Legenda de categorias">
            <Tags className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Categorias
          </p>
          <ul className="space-y-1.5">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                <span className="text-foreground">{c.name}</span>
              </li>
            ))}
            {categories.length === 0 && (
              <li className="text-xs text-muted-foreground">Nenhuma ainda</li>
            )}
          </ul>
        </PopoverContent>
      </Popover>
      <div className="flex-1">
        <QuickAddBar todayISO={isoDay(new Date())} />
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onReplanDay(selectedIso)}
        className="shrink-0"
        title="Replanejar dia selecionado"
      >
        <Sparkles className="mr-1 h-3.5 w-3.5" /> Replanejar
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => carryMut.mutate()}
        disabled={carryMut.isPending}
        className="shrink-0"
        title="Migrar tarefas pendentes para hoje"
      >
        <ArrowDownToLine className="mr-1 h-3.5 w-3.5" /> Migrar pendentes
      </Button>
      <AiInsightsPanel
        day={selectedIso}
        onReplanDay={onReplanDay}
        onApplySuggestion={onApplySuggestion}
      />
      <CalendarSyncButton from={daysISO[0]} to={daysISO[daysISO.length - 1]} onSynced={onSynced} />
    </div>
  );
}
