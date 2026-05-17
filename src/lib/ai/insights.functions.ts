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

const InsightsSchema = z.object({
  summary: z.string().min(1).max(400),
  overloadScore: z.number().min(0).max(100),
  totalMinutes: z.number().int().min(0),
  freeMinutes: z.number().int().min(0),
  suggestions: z.array(SuggestionSchema).max(8),
});

export type AiSuggestion = z.infer<typeof SuggestionSchema>;
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

    // Heurística: dia sem dados → resposta determinística (evita chamada à IA).
    if (taskCtx.length === 0 && eventCtx.length === 0) {
      return {
        summary: "Dia vazio — espaço livre para planejar com calma.",
        overloadScore: 0,
        totalMinutes: 0,
        freeMinutes: free,
        suggestions: [],
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
      // Garante consistência dos contadores (modelo às vezes inventa).
      return {
        ...object,
        totalMinutes: busy,
        freeMinutes: free,
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
      };
    }
  });
