import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Check, Pause, Play, RotateCcw, Maximize2, Minimize2, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { listWeekData, updateTask } from "@/lib/tasks.functions";

export const Route = createFileRoute("/_authenticated/app/focus")({
  component: FocusPage,
  head: () => ({ meta: [{ title: "Foco — FocusQueue" }] }),
});

const DEFAULT_DURATION_MIN = 25;

interface FocusTask {
  id: string;
  title: string;
  estimated_minutes: number;
  priority: "low" | "medium" | "high" | "urgent";
  status: "pending" | "in_progress" | "done" | "skipped";
  category_id: string | null;
  scheduled_start: string | null;
  scheduled_day: string;
  parent_id: string | null;
  queue_position: number;
}

function tsToMinute(ts: string | null): number {
  if (!ts) return Number.POSITIVE_INFINITY;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function FocusPage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const listFn = useServerFn(listWeekData);
  const updateFn = useServerFn(updateTask);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["focus", today],
    queryFn: () => listFn({ data: { days: [today] } }),
  });

  const categories = useMemo(
    () => (data?.categories ?? []) as { id: string; name: string; color: string }[],
    [data],
  );
  const categoryById = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c])),
    [categories],
  );

  const tasks = useMemo<FocusTask[]>(() => {
    const all = (data?.tasks ?? []) as FocusTask[];
    return all
      .filter((t) => t.scheduled_day === today && !t.parent_id)
      .sort((a, b) => {
        const ma = tsToMinute(a.scheduled_start);
        const mb = tsToMinute(b.scheduled_start);
        if (ma !== mb) return ma - mb;
        return a.queue_position - b.queue_position;
      });
  }, [data, today]);

  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pending = tasks.filter((t) => t.status !== "done" && t.status !== "skipped");
  const current = pending[0];
  const next = pending[1];
  const cat = current?.category_id ? categoryById[current.category_id] : undefined;

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(DEFAULT_DURATION_MIN * 60);
  const [running, setRunning] = useState(false);
  const [deepWork, setDeepWork] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Reset timer when current task changes.
  useEffect(() => {
    if (!current) return;
    if (activeId !== current.id) {
      setActiveId(current.id);
      setSecondsLeft(Math.max(60, current.estimated_minutes * 60));
      setRunning(false);
    }
  }, [current, activeId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setRunning(false);
          toast.success("Tempo concluído", { description: "Faça uma pausa breve." });
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; status: FocusTask["status"] }) =>
      updateFn({ data: vars }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["focus"] }),
  });

  const completeCurrent = useCallback(() => {
    if (!current) return;
    setRunning(false);
    updateMut.mutate({ id: current.id, status: "done" });
    const messages = [
      "Mais uma! Continue assim.",
      "Boa — um passo de cada vez.",
      "Feito. Respire e siga.",
      "Excelente progresso.",
    ];
    toast.success(messages[Math.floor(Math.random() * messages.length)]);
  }, [current, updateMut]);

  const skipCurrent = useCallback(() => {
    if (!current) return;
    setRunning(false);
    updateMut.mutate({ id: current.id, status: "skipped" });
  }, [current, updateMut]);

  // Keyboard shortcuts (calm: only essentials)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setRunning((r) => !r);
      } else if (e.key === "Enter") {
        e.preventDefault();
        completeCurrent();
      } else if (e.key === "f" || e.key === "F") {
        setDeepWork((d) => !d);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [completeCurrent]);

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  const tint = cat?.color ?? "oklch(0.65 0.15 260)";
  const progressPct = total === 0 ? 0 : Math.round((done / total) * 100);

  const body = (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col items-center justify-center gap-12 px-6 py-10 transition-colors duration-500",
        deepWork && "fixed inset-0 z-50 bg-background",
      )}
    >
      {/* Top bar: progress + deep-work toggle */}
      <div className="absolute inset-x-0 top-0 flex items-center gap-4 px-8 py-5">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Progresso de hoje</span>
            <span className="tabular-nums">
              {done} / {total}
            </span>
          </div>
          <Progress value={progressPct} className="h-1.5" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeepWork((d) => !d)}
          title={deepWork ? "Sair do modo deep work (F)" : "Entrar no modo deep work (F)"}
          className="shrink-0"
        >
          {deepWork ? (
            <Minimize2 className="h-4 w-4" />
          ) : (
            <Maximize2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Empty state */}
      {!isLoading && !current && (
        <div className="animate-fade-in text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Check className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Tudo feito por hoje</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {total > 0
              ? `${total} tarefa(s) concluída(s). Descanse — você mereceu.`
              : "Nenhuma tarefa para hoje. Aproveite o silêncio."}
          </p>
        </div>
      )}

      {/* Current task */}
      {current && (
        <div className="flex w-full max-w-xl animate-fade-in flex-col items-center text-center">
          <span className="mb-3 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Agora
          </span>
          {cat && (
            <div className="mb-3 flex items-center gap-2 text-xs">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: tint }}
              />
              <span className="text-muted-foreground">{cat.name}</span>
            </div>
          )}
          <h1
            className="text-balance text-3xl font-semibold leading-tight tracking-tight md:text-4xl"
            style={{ color: "var(--foreground)" }}
          >
            {current.title}
          </h1>

          {/* Timer */}
          <div className="mt-10 flex flex-col items-center gap-5">
            <div
              className="font-mono text-6xl font-light tabular-nums tracking-tight md:text-7xl"
              style={{ color: running ? tint : "var(--foreground)" }}
            >
              {mm}:{ss}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="lg"
                onClick={() => setRunning((r) => !r)}
                className="min-w-[140px]"
              >
                {running ? (
                  <>
                    <Pause className="mr-2 h-4 w-4" /> Pausar
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> {secondsLeft === 0 ? "Reiniciar" : "Iniciar"}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => {
                  setSecondsLeft(Math.max(60, current.estimated_minutes * 60));
                  setRunning(false);
                }}
                title="Reiniciar timer"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Espaço: iniciar/pausar · Enter: concluir · F: deep work
            </p>
          </div>

          {/* Actions */}
          <div className="mt-8 flex items-center gap-2">
            <Button variant="default" size="sm" onClick={completeCurrent}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Concluir
            </Button>
            <Button variant="ghost" size="sm" onClick={skipCurrent}>
              <SkipForward className="mr-1.5 h-3.5 w-3.5" /> Pular
            </Button>
          </div>
        </div>
      )}

      {/* Next task hint */}
      {next && (
        <div className="w-full max-w-xl animate-fade-in border-t border-border/60 pt-6 text-center">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            A seguir
          </span>
          <p className="mt-1.5 truncate text-sm text-muted-foreground">
            {next.title}
            <span className="ml-2 text-xs opacity-70">
              {next.estimated_minutes}m
            </span>
          </p>
        </div>
      )}
    </div>
  );

  return body;
}
