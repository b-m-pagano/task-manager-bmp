import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageSquareText, AlertTriangle, Plus, Check, ArrowRight } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { getLocalTzOffsetMinutes } from "@/lib/timezone";
import {
  applyTextReplan, proposeTextReplan, type TextReplanProposal,
} from "@/lib/ai/replan.functions";

const EXAMPLES = [
  "Estou 40 minutos atrasado na tarefa atual",
  "Surgiu uma reunião às 15h de 1 hora",
  "A entrega do cliente virou urgente, o resto pode esperar",
];

function fmt(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function TextReplanDialog({ day }: { day: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [plan, setPlan] = useState<TextReplanProposal | null>(null);
  const qc = useQueryClient();
  const proposeFn = useServerFn(proposeTextReplan);
  const applyFn = useServerFn(applyTextReplan);

  const propose = useMutation({
    mutationFn: () => {
      const now = new Date();
      const today = now.toLocaleDateString("sv-SE");
      const nowMin = day === today ? now.getHours() * 60 + now.getMinutes() : 0;
      return proposeFn({
        data: { day, text, now_minute: nowMin, tz_offset_minutes: getLocalTzOffsetMinutes() },
      });
    },
    onSuccess: setPlan,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível replanejar"),
  });

  const apply = useMutation({
    mutationFn: (p: TextReplanProposal) =>
      applyFn({
        data: {
          day,
          tz_offset_minutes: getLocalTzOffsetMinutes(),
          placements: p.placements,
          done: p.done.map((d) => d.id),
          tomorrow: [...p.tomorrow, ...p.overflow].map((d) => d.id).filter((id) => !id.startsWith("new:")),
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Agenda reorganizada");
      setOpen(false);
      setPlan(null);
      setText("");
    },
    onError: () => toast.error("Não foi possível aplicar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0" title="Ajustar agenda com IA">
          <MessageSquareText className="mr-1 h-3.5 w-3.5" /> Ajustar dia
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajustar o resto do dia</DialogTitle>
          <DialogDescription>
            Conte o que mudou. A IA reorganiza as tarefas sem mexer nos eventos do Google Calendar.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex.: atrasei 30 min no relatório e entrou uma call às 16h…"
          rows={3}
        />
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              {ex}
            </button>
          ))}
        </div>

        {plan && (
          <div className="space-y-3 rounded-md border border-border p-3">
            <p className="text-sm">{plan.summary}</p>
            <ul className="space-y-1.5">
              {plan.placements.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                    {fmt(p.start)}–{fmt(Math.min(1440, p.start + p.duration))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.title}</span>
                  {p.isNew && <Badge variant="secondary"><Plus className="mr-0.5 h-3 w-3" />nova</Badge>}
                  {!p.isNew && p.previousStart != null && p.previousStart !== p.start && (
                    <span className="text-xs text-muted-foreground">era {fmt(p.previousStart)}</span>
                  )}
                  {p.afterHours && <AlertTriangle className="h-3.5 w-3.5 text-destructive" aria-label="após 18h" />}
                </li>
              ))}
            </ul>
            {plan.done.length > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3 w-3" /> Concluídas: {plan.done.map((d) => d.title).join(", ")}
              </p>
            )}
            {[...plan.tomorrow, ...plan.overflow].length > 0 && (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <ArrowRight className="h-3 w-3" /> Para amanhã:{" "}
                {[...plan.tomorrow, ...plan.overflow].map((d) => d.title).join(", ")}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant={plan ? "outline" : "default"}
            disabled={text.trim().length < 3 || propose.isPending}
            onClick={() => propose.mutate()}
          >
            {propose.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {plan ? "Gerar de novo" : "Reorganizar"}
          </Button>
          {plan && (
            <Button disabled={apply.isPending} onClick={() => apply.mutate(plan)}>
              {apply.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Aplicar na agenda
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
