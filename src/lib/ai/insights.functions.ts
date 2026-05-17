/**
 * AI Insights — análise diária do agendamento via Lovable AI Gateway.
 *
 * Server-only. Lê tarefas + eventos do dia, envia contexto compacto para
 * o modelo e retorna recomendações estruturadas:
 *   - reorganizações
 *   - previsão de atrasos
 *   - sugestões de buffer
 *   - detecção de overload
 *   - melhores horários
 *
 * Arquitetura preparada para futuras automações (learning engine,
 * behavioral analytics, estimativas inteligentes): o handler retorna
 * sempre o mesmo shape (`AiInsights`) e o componente de UI só consome
 * esse shape — trocar o backend (heurística → LLM → modelo treinado)
 * não exige mudar consumidores.
 */
import { createServerFn } from "@tanstack/react-start";
import { generateObject } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway";

const SuggestionSchema = z.object({
  type: z.enum(["reorganize", "buffer", "delay_risk", "overload", "best_time", "note"]),
  title: z.string().min(1).max(120),
  reason: z.string().min(1).max(400),
  taskIds: z.array(z.string()).max(20).optional(),
  /** Minuto sugerido (0–1439) para a tarefa principal, quando aplicável. */
  suggestedStartMinute: z.number().int().min(0).max(1439).optional(),
  severity: z.enum(["info", "warn", "high"]).default("info"),
});

const TaskRiskSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  /** Minuto previsto de término considerando fila + eventos bloqueantes. */
  predictedEndMinute: z.number().int().min(0),
  /** Quantos minutos a tarefa deve atrasar em relação ao previsto/limite. */
  delayMinutes: z.number().int(),
  /** Risco de adiamento para o dia seguinte (0–100). */
  postponementRisk: z.number().min(0).max(100),
  severity: z.enum(["info", "warn", "high"]),
  reason: z.string().min(1).max(200),
});

const InsightsSchema = z.object({
  summary: z.string().min(1).max(400),
  overloadScore: z.number().min(0).max(100),
  totalMinutes: z.number().int().min(0),
  freeMinutes: z.number().int().min(0),
  suggestions: z.array(SuggestionSchema).max(8),
  taskRisks: z.array(TaskRiskSchema).max(50).default([]),
});

export type AiSuggestion = z.infer<typeof SuggestionSchema>;
export type AiTaskRisk = z.infer<typeof TaskRiskSchema>;
export type AiInsights = z.infer<typeof InsightsSchema>;

const DAY_START = 8 * 60; // 08:00
const DAY_END = 22 * 60; // 22:00

function tsToMinute(ts: string | null | undefined): number | null {
  if (!ts) return null;
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}
function fmt(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export const analyzeDay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<AiInsights> => {
    const { supabase } = context;
    const { day } = data;

    const [{ data: tasks }, { data: events }, { data: cats }] = await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id,title,estimated_minutes,priority,status,scheduled_start,category_id,due_date,parent_id",
        )
        .eq("scheduled_day", day)
        .is("parent_id", null),
      supabase
        .from("calendar_events")
        .select("id,title,starts_at,ends_at,is_blocking")
        .gte("starts_at", `${day}T00:00:00`)
        .lt("starts_at", `${day}T23:59:59`),
      supabase.from("categories").select("id,name"),
    ]);

    const catName = new Map((cats ?? []).map((c) => [c.id, c.name]));

    // Contexto compacto para o modelo (token-efficient).
    let stack = DAY_START;
    const taskCtx = (tasks ?? []).map((t) => {
      const start = tsToMinute(t.scheduled_start) ?? stack;
      stack = Math.max(stack, start) + (t.estimated_minutes ?? 30);
      return {
        id: t.id,
        title: t.title,
        category: t.category_id ? catName.get(t.category_id) ?? null : null,
        priority: t.priority,
        status: t.status,
        durationMin: t.estimated_minutes ?? 30,
        startMinute: start,
        startHHMM: fmt(start),
        due: t.due_date,
      };
    });

    const eventCtx = (events ?? []).map((e) => {
      const s = tsToMinute(e.starts_at) ?? 0;
      const en = tsToMinute(e.ends_at) ?? s;
      return {
        id: e.id,
        title: e.title,
        startHHMM: fmt(s),
        endHHMM: fmt(en),
        blocking: !!e.is_blocking,
      };
    });

    const busy = [
      ...taskCtx
        .filter((t) => t.status !== "done" && t.status !== "skipped")
        .map((t) => t.durationMin),
      ...eventCtx.map((e) => {
        const [sh, sm] = e.startHHMM.split(":").map(Number);
        const [eh, em] = e.endHHMM.split(":").map(Number);
        return eh * 60 + em - (sh * 60 + sm);
      }),
    ].reduce((a, b) => a + b, 0);

    const total = DAY_END - DAY_START;
    const free = Math.max(0, total - busy);

    // ============= Risco por tarefa (heurística determinística) =============
    // Simula a fila respeitando eventos bloqueantes para prever término real.
    const blockingWindows = eventCtx
      .filter((e) => e.blocking)
      .map((e) => {
        const [sh, sm] = e.startHHMM.split(":").map(Number);
        const [eh, em] = e.endHHMM.split(":").map(Number);
        return { start: sh * 60 + sm, end: eh * 60 + em };
      })
      .sort((a, b) => a.start - b.start);

    function nextFreeSlot(from: number, duration: number): number {
      let cursor = Math.max(from, DAY_START);
      for (const w of blockingWindows) {
        if (cursor + duration <= w.start) break;
        if (cursor < w.end && cursor + duration > w.start) cursor = w.end;
      }
      return cursor;
    }

    const AFTER_HOURS = 18 * 60;
    let runStack = DAY_START;
    const taskRisks = taskCtx
      .filter((t) => t.status !== "done" && t.status !== "skipped")
      .map((t) => {
        const desiredStart = Math.max(t.startMinute, runStack);
        const actualStart = nextFreeSlot(desiredStart, t.durationMin);
        const predictedEnd = actualStart + t.durationMin;
        runStack = predictedEnd;

        const scheduledEnd = t.startMinute + t.durationMin;
        const delayMinutes = Math.max(0, predictedEnd - scheduledEnd);

        // Risco de adiamento: combina extravasamento, tarde da noite e prioridade.
        let risk = 0;
        if (predictedEnd > DAY_END) risk += 70;
        else if (predictedEnd > AFTER_HOURS) risk += 35;
        if (delayMinutes >= 60) risk += 25;
        else if (delayMinutes >= 15) risk += 10;
        if (t.priority === "high" || t.priority === "urgent") risk += 5;
        if (t.due && t.due < day) risk += 20; // já estourou prazo
        risk = Math.min(100, risk);

        const severity: "info" | "warn" | "high" =
          risk >= 70 ? "high" : risk >= 35 ? "warn" : "info";

        const reasonParts: string[] = [];
        if (predictedEnd > DAY_END)
          reasonParts.push("ultrapassa o fim do dia útil");
        else if (predictedEnd > AFTER_HOURS)
          reasonParts.push("termina após 18h");
        if (delayMinutes > 0)
          reasonParts.push(`atraso previsto de ${delayMinutes}min`);
        if (t.due && t.due < day) reasonParts.push("prazo vencido");
        if (reasonParts.length === 0) reasonParts.push("dentro do esperado");

        return {
          taskId: t.id,
          title: t.title,
          predictedEndMinute: predictedEnd,
          delayMinutes,
          postponementRisk: risk,
          severity,
          reason: reasonParts.join(" · "),
        };
      });

    // Heurística: dia sem dados → resposta determinística (evita chamada à IA).
    if (taskCtx.length === 0 && eventCtx.length === 0) {
      return {
        summary: "Dia vazio — espaço livre para planejar com calma.",
        overloadScore: 0,
        totalMinutes: 0,
        freeMinutes: free,
        suggestions: [],
        taskRisks: [],
      };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      // Fallback puramente heurístico — mantém o app funcional sem IA.
      const overload = Math.min(100, Math.round((busy / total) * 100));
      const suggestions: AiSuggestion[] = [];
      if (overload > 90) {
        suggestions.push({
          type: "overload",
          title: "Dia sobrecarregado",
          reason: `Ocupação de ~${overload}% do horário comercial. Considere mover tarefas de baixa prioridade.`,
          severity: "high",
        });
      }
      const afterHours = taskCtx.filter((t) => t.startMinute >= 18 * 60);
      if (afterHours.length > 0) {
        suggestions.push({
          type: "delay_risk",
          title: `${afterHours.length} tarefa(s) após 18h`,
          reason: "Risco de atraso e fadiga — considere replanejar ou migrar.",
          taskIds: afterHours.map((t) => t.id),
          severity: "warn",
        });
      }
      return {
        summary: "Análise heurística (IA indisponível).",
        overloadScore: overload,
        totalMinutes: busy,
        freeMinutes: free,
        suggestions,
        taskRisks,
      };
    }

    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "Você é um assistente de produtividade focado em TDAH.",
      "Analise a agenda do dia e produza sugestões CURTAS, ACIONÁVEIS e CALMAS.",
      "Regras:",
      "- Eventos de calendário têm prioridade absoluta — nunca sugira movê-los.",
      "- Use horários no fuso local do usuário (HH:MM, 24h).",
      "- Prefira poucas sugestões boas (máx 5) a muitas genéricas.",
      "- Se algo parece bem, diga isso no summary e devolva poucas sugestões.",
      "- Para reorganize/best_time, inclua taskIds e suggestedStartMinute quando útil.",
      "- Para overload, calcule um score 0–100 honesto.",
      "- Considere taskRisks fornecidos: tarefas com risco alto merecem destaque nas sugestões.",
      "- NÃO repita taskRisks no campo suggestions — eles são exibidos separadamente.",
      "- Linguagem: português do Brasil, tom leve, sem alarmismo.",
    ].join("\n");

    const prompt = JSON.stringify(
      {
        day,
        dayWindow: { start: fmt(DAY_START), end: fmt(DAY_END) },
        busyMinutes: busy,
        freeMinutes: free,
        events: eventCtx,
        tasks: taskCtx,
        taskRisks,
      },
      null,
      0,
    );

    try {
      const { object } = await generateObject({
        model,
        schema: InsightsSchema,
        system,
        prompt,
      });
      // Garante consistência dos contadores e injeta risks calculados localmente.
      return {
        ...object,
        totalMinutes: busy,
        freeMinutes: free,
        taskRisks,
      };
    } catch (err) {
      console.error("[ai.analyzeDay] gateway error", err);
      const overload = Math.min(100, Math.round((busy / total) * 100));
      return {
        summary: "Não consegui consultar a IA agora — mostrando análise básica.",
        overloadScore: overload,
        totalMinutes: busy,
        freeMinutes: free,
        suggestions: [],
        taskRisks,
      };
    }
  });
