import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, Play, RotateCcw, Wrench, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { runMcpTool } from "@/lib/mcp/test-panel.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/tools")({
  component: ToolsPage,
  head: () => ({
    meta: [
      { title: "Ferramentas MCP — BMP Task Manager" },
      { name: "description", content: "Teste as ferramentas de agente do BMP Task Manager sem precisar do Claude." },
    ],
  }),
});

const today = () => new Date().toLocaleDateString("sv-SE");
const nowHM = () => new Date().toTimeString().slice(0, 5);
const tz = () => -new Date().getTimezoneOffset();
const ID = "COLE-AQUI-O-ID-DA-TAREFA";

type ToolInfo = { name: string; label: string; help: string; writes: boolean; example: () => object };

const GROUPS: { title: string; tools: ToolInfo[] }[] = [
  {
    title: "Ler",
    tools: [
      { name: "list_tasks", label: "Listar tarefas", help: "Mostra as tarefas de um dia (copie daqui os IDs para os outros testes).", writes: false, example: () => ({ day: today(), limit: 20 }) },
      { name: "get_day_schedule", label: "Agenda do dia", help: "Tarefas + eventos do Google Calendar do dia.", writes: false, example: () => ({ day: today(), tz_offset_minutes: tz() }) },
      { name: "list_subtasks", label: "Ver passos de uma tarefa", help: "Progresso dos passos de uma tarefa.", writes: false, example: () => ({ task_id: ID }) },
    ],
  },
  {
    title: "Quebrar em passos",
    tools: [
      { name: "decompose_task", label: "Quebrar tarefa existente", help: "Adiciona passos pequenos a uma tarefa.", writes: true, example: () => ({ task_id: ID, steps: [{ title: "Abrir o documento", estimated_minutes: 5 }, { title: "Escrever o primeiro rascunho", estimated_minutes: 20 }] }) },
      { name: "create_task_with_subtasks", label: "Criar tarefa já com passos", help: "Cria uma tarefa nova com checklist.", writes: true, example: () => ({ title: "Teste do painel", day: today(), steps: [{ title: "Passo 1", estimated_minutes: 10 }, { title: "Passo 2", estimated_minutes: 15 }] }) },
    ],
  },
  {
    title: "Agenda e replanejamento",
    tools: [
      { name: "schedule_task", label: "Mover tarefa", help: "Muda uma tarefa de dia/horário.", writes: true, example: () => ({ task_id: ID, day: today(), start_time: "15:00", tz_offset_minutes: tz() }) },
      { name: "replan_day", label: "Replanejar o resto do dia", help: "Reorganiza a partir de agora sem sobrepor o Calendar. Salva direto.", writes: true, example: () => ({ day: today(), now_time: nowHM(), tz_offset_minutes: tz(), instruction: { order: [], changes: [], newItems: [{ title: "Reunião de teste", durationMin: 30, priority: "high", fixedStartMinute: null }] } }) },
      { name: "set_task_status", label: "Mudar status", help: "Marca como concluída, pendente etc.", writes: true, example: () => ({ task_id: ID, status: "done" }) },
    ],
  },
  {
    title: "Inbox",
    tools: [
      { name: "add_task_to_inbox", label: "Adicionar à Inbox", help: "Captura uma tarefa sem data.", writes: true, example: () => ({ title: "Teste de captura", estimated_minutes: 15, priority: "medium" }) },
      { name: "import_to_inbox", label: "Importar em lote", help: "Simula itens vindos do Gmail/Slack.", writes: true, example: () => ({ items: [{ title: "Responder proposta", source: "gmail", source_url: "https://mail.google.com/mail/u/0/#inbox/teste", estimated_minutes: 15 }] }) },
    ],
  },
];

function ToolsPage() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Wrench className="h-5 w-5" /> Ferramentas MCP
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            As mesmas ferramentas que o Claude usa, rodando na sua conta. Edite os dados e clique em Executar.
            As marcadas como <span className="font-medium text-amber-600 dark:text-amber-400">altera dados</span> mudam sua agenda de verdade.
          </p>
        </header>
        {GROUPS.map((g) => (
          <section key={g.title} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
            {g.tools.map((t) => <ToolCard key={t.name} tool={t} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

function ToolCard({ tool }: { tool: ToolInfo }) {
  const run = useServerFn(runMcpTool);
  const qc = useQueryClient();
  const [input, setInput] = useState(() => JSON.stringify(tool.example(), null, 2));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ isError: boolean; text: string; structured: string | null } | null>(null);

  async function execute() {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(input);
    } catch {
      toast.error("Os dados não estão em formato válido");
      return;
    }
    if (JSON.stringify(args).includes(ID)) {
      toast.error("Troque o texto do ID por um ID real (use “Listar tarefas”).");
      return;
    }
    setBusy(true);
    try {
      const r = await run({ data: { name: tool.name, args } });
      setResult(r);
      if (tool.writes && !r.isError) void qc.invalidateQueries();
    } catch (e) {
      setResult({ isError: true, text: (e as Error).message, structured: null });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          {tool.label}
          <code className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">{tool.name}</code>
          <span className={cn("rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase",
            tool.writes ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-primary/10 text-primary")}>
            {tool.writes ? "altera dados" : "só leitura"}
          </span>
        </CardTitle>
        <CardDescription className="text-xs">{tool.help}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea value={input} onChange={(e) => setInput(e.target.value)} spellCheck={false}
          className="min-h-[90px] font-mono text-[11px]" />
        <div className="flex gap-2">
          <Button size="sm" onClick={execute} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />} Executar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setInput(JSON.stringify(tool.example(), null, 2)); setResult(null); }}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Exemplo
          </Button>
        </div>
        {result && (
          <div className={cn("rounded-md border p-2 text-xs", result.isError ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/30")}>
            <p className="mb-1 flex items-center gap-1 font-medium">
              {result.isError ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
              {result.isError ? "Erro" : "Resultado"}
            </p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
              {result.structured ?? result.text}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
