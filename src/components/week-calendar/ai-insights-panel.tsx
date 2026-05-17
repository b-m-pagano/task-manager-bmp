import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sparkles,
  AlertTriangle,
  Clock,
  Gauge,
  Lightbulb,
  Loader2,
  ArrowRightCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { analyzeDay, type AiInsights, type AiSuggestion } from "@/lib/ai/insights.functions";

interface AiInsightsPanelProps {
  day: string;
  /** Aplica uma sugestão pontual (move uma tarefa para um minuto específico). */
  onApplySuggestion?: (taskId: string, day: string, startMinute: number) => void;
  /** Botão "Replanejar tudo" reaproveita o motor de auto-schedule já existente. */
  onReplanDay?: (day: string) => void;
}

const TYPE_ICON: Record<AiSuggestion["type"], typeof Sparkles> = {
  reorganize: ArrowRightCircle,
  buffer: Clock,
  delay_risk: AlertTriangle,
  overload: Gauge,
  best_time: Sparkles,
  note: Lightbulb,
};

const SEVERITY_STYLES: Record<AiSuggestion["severity"], string> = {
  info: "border-border bg-card",
  warn: "border-amber-500/40 bg-amber-500/5",
  high: "border-destructive/40 bg-destructive/5",
};

function fmt(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function AiInsightsPanel({
  day,
  onApplySuggestion,
  onReplanDay,
}: AiInsightsPanelProps) {
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<AiInsights | null>(null);
  const analyzeFn = useServerFn(analyzeDay);

  const mut = useMutation({
    mutationFn: () => analyzeFn({ data: { day } }),
    onSuccess: (data) => setInsights(data),
    onError: () => toast.error("Não foi possível analisar o dia"),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !mut.isPending && !insights) {
      mut.mutate();
    }
  };

  const refresh = () => {
    setInsights(null);
    mut.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0" title="Insights de IA">
          <Sparkles className="mr-1 h-3.5 w-3.5" /> IA
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Insights do dia
          </SheetTitle>
          <SheetDescription className="text-xs">
            Sugestões para {day} — geradas por IA, sempre revisáveis.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">
            {mut.isPending && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando agenda…
              </div>
            )}

            {insights && (
              <>
                <section className="space-y-2">
                  <p className="text-sm leading-relaxed text-foreground">
                    {insights.summary}
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                      <span>Carga do dia</span>
                      <span className="tabular-nums">
                        {insights.overloadScore}%
                      </span>
                    </div>
                    <Progress
                      value={insights.overloadScore}
                      className={cn(
                        "h-1.5",
                        insights.overloadScore >= 90 && "[&>div]:bg-destructive",
                        insights.overloadScore >= 70 &&
                          insights.overloadScore < 90 &&
                          "[&>div]:bg-amber-500",
                      )}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {Math.round(insights.totalMinutes / 60)}h ocupadas ·{" "}
                      {Math.round(insights.freeMinutes / 60)}h livres
                    </p>
                  </div>
                </section>

                {insights.suggestions.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Sem recomendações no momento. Seu dia parece equilibrado.
                  </p>
                ) : (
                  <section className="space-y-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Sugestões
                    </h3>
                    <ul className="space-y-2">
                      {insights.suggestions.map((s, idx) => {
                        const Icon = TYPE_ICON[s.type] ?? Lightbulb;
                        const canApply =
                          (s.type === "reorganize" || s.type === "best_time") &&
                          s.taskIds &&
                          s.taskIds.length > 0 &&
                          typeof s.suggestedStartMinute === "number" &&
                          !!onApplySuggestion;
                        return (
                          <li
                            key={idx}
                            className={cn(
                              "rounded-md border p-3 text-sm",
                              SEVERITY_STYLES[s.severity],
                            )}
                          >
                            <div className="flex items-start gap-2">
                              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium leading-tight">
                                    {s.title}
                                  </p>
                                  {s.severity !== "info" && (
                                    <Badge
                                      variant={
                                        s.severity === "high"
                                          ? "destructive"
                                          : "secondary"
                                      }
                                      className="h-4 px-1.5 text-[9px]"
                                    >
                                      {s.severity === "high" ? "alto" : "atenção"}
                                    </Badge>
                                  )}
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  {s.reason}
                                </p>
                                {typeof s.suggestedStartMinute === "number" && (
                                  <p className="mt-1.5 text-[11px] tabular-nums text-muted-foreground">
                                    Sugestão: começar às{" "}
                                    <span className="font-semibold text-foreground">
                                      {fmt(s.suggestedStartMinute)}
                                    </span>
                                  </p>
                                )}
                                {canApply && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="mt-2 h-7 text-xs"
                                    onClick={() => {
                                      const id = s.taskIds![0];
                                      onApplySuggestion!(
                                        id,
                                        day,
                                        s.suggestedStartMinute!,
                                      );
                                      toast.success("Sugestão aplicada");
                                    }}
                                  >
                                    Aplicar
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={refresh}
            disabled={mut.isPending}
          >
            {mut.isPending ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1 h-3.5 w-3.5" />
            )}
            Reanalisar
          </Button>
          {onReplanDay && (
            <Button
              size="sm"
              onClick={() => {
                onReplanDay(day);
                setOpen(false);
              }}
            >
              <ArrowRightCircle className="mr-1 h-3.5 w-3.5" /> Replanejar dia
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
