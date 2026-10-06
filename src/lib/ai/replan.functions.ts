/**
 * Replanejamento por texto livre: a IA interpreta o pedido (atrasos,
 * compromissos novos, prioridades) e o motor determinístico calcula os
 * horários sem sobrepor eventos do Google Calendar.
 */
import { createServerFn } from "@tanstack/react-start";
import { createOpenAI } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatTzOffset } from "@/lib/timezone";
import { buildTextReplan, type ReplanResult } from "@/lib/queue/text-replan";

const Priority = z.enum(["low", "medium", "high", "urgent"]);

const InstructionSchema = z.object({
  summary: z.string(),
  order: z.array(z.string()),
  changes: z.array(
    z.object({
      taskId: z.string(),
      priority: Priority.nullable(),
      durationMin: z.number().int().nullable(),
      markDone: z.boolean(),
      moveToTomorrow: z.boolean(),
    }),
  ),
  newItems: z.array(
    z.object({
      title: z.string(),
      durationMin: z.number().int(),
      priority: Priority,
      fixedStartMinute: z.number().int().nullable(),
    }),
  ),
});

export type TextReplanProposal = ReplanResult & { summary: string; fromMinute: number };

function localMinute(ts: string, tz: number) {
  const d = new Date(ts);
  return (((d.getUTCHours() * 60 + d.getUTCMinutes() + tz) % 1440) + 1440) % 1440;
}
function hhmm(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function ts(day: string, minute: number, tz: number) {
  return `${day}T${hhmm(minute)}:00${formatTzOffset(tz)}`;
}
function addDay(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const InputSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  text: z.string().min(3).max(2000),
  now_minute: z.number().int().min(0).max(1439),
  tz_offset_minutes: z.number().int(),
});

export const proposeTextReplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => InputSchema.parse(i))
  .handler(async ({ data, context }): Promise<TextReplanProposal> => {
    const { supabase } = context;
    const tz = data.tz_offset_minutes;
    const [{ data: tasks }, { data: events }] = await Promise.all([
      supabase
        .from("tasks")
        .select("id,title,estimated_minutes,priority,status,scheduled_start")
        .eq("scheduled_day", data.day)
        .eq("is_inbox", false)
        .is("parent_id", null)
        .in("status", ["pending", "in_progress"]),
      supabase
        .from("calendar_events")
        .select("title,starts_at,ends_at,is_blocking,all_day")
        .lt("starts_at", ts(data.day, 1439, tz))
        .gt("ends_at", ts(data.day, 0, tz)),
    ]);

    const taskList = (tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.estimated_minutes ?? 30,
      priority: t.priority,
      startMinute: t.scheduled_start ? localMinute(t.scheduled_start, tz) : null,
    }));
    const blocks = (events ?? [])
      .filter((e) => e.is_blocking && !e.all_day)
      .map((e) => {
        const s = new Date(e.starts_at) <= new Date(ts(data.day, 0, tz)) ? 0 : localMinute(e.starts_at, tz);
        const en = new Date(e.ends_at) >= new Date(ts(data.day, 1439, tz)) ? 1440 : localMinute(e.ends_at, tz);
        return { title: e.title, start: s, end: en };
      });

    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("IA não configurada");
    const openai = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const prompt = JSON.stringify({
      agora: hhmm(data.now_minute),
      tarefas: taskList.map((t) => ({
        id: t.id, titulo: t.title, duracaoMin: t.duration, prioridade: t.priority,
        inicio: t.startMinute != null ? hhmm(t.startMinute) : null,
      })),
      eventosCalendario: blocks.map((b) => ({ titulo: b.title, inicio: hhmm(b.start), fim: hhmm(b.end) })),
      pedido: data.text,
    });

    const result = streamText({
      model: openai.responses("openai/gpt-6-astra"),
      system:
        "Você reorganiza a agenda restante do dia de um usuário com TDAH. Interprete o pedido em português: " +
        "atrasos (aumente durationMin da tarefa atrasada), compromissos novos (newItems; fixedStartMinute em minutos desde 00:00 se tiver hora, senão null), " +
        "mudanças de prioridade, tarefas concluídas (markDone) ou adiadas (moveToTomorrow). " +
        "Em 'order' liste os ids das tarefas existentes na nova ordem desejada (mais importantes primeiro, mantendo a ordem atual quando não houver motivo). " +
        "Inclua em 'changes' apenas tarefas alteradas, com null nos campos sem mudança. Nunca invente ids. " +
        "Eventos do calendário são intocáveis; os horários finais serão calculados pelo sistema. 'summary': 1-2 frases em português explicando o que mudou.",
      prompt,
      experimental_output: Output.object({ schema: InstructionSchema }),
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: "low",
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    await result.consumeStream();
    const instr = await result.experimental_output;

    const plan = buildTextReplan(taskList, blocks, instr, {
      fromMinute: Math.max(7 * 60, data.now_minute),
      afterHours: 18 * 60,
    });
    return { ...plan, summary: instr.summary, fromMinute: data.now_minute };
  });

const ApplySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tz_offset_minutes: z.number().int(),
  placements: z.array(
    z.object({
      id: z.string(),
      title: z.string().min(1).max(300),
      start: z.number().int().min(0).max(1439),
      duration: z.number().int().min(5).max(1440),
      priority: Priority,
      isNew: z.boolean(),
    }),
  ),
  done: z.array(z.string().uuid()),
  tomorrow: z.array(z.string().uuid()),
});

export const applyTextReplan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => ApplySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tz = data.tz_offset_minutes;
    const ops: PromiseLike<unknown>[] = [];
    for (const p of data.placements) {
      const fields = {
        scheduled_day: data.day,
        scheduled_start: ts(data.day, p.start, tz),
        scheduled_end: ts(data.day, Math.min(1439, p.start + p.duration), tz),
        estimated_minutes: p.duration,
        priority: p.priority,
        is_inbox: false,
      };
      if (p.isNew) {
        ops.push(supabase.from("tasks").insert({ ...fields, title: p.title, user_id: userId }));
      } else {
        ops.push(supabase.from("tasks").update(fields).eq("id", p.id).eq("user_id", userId));
      }
    }
    if (data.done.length)
      ops.push(
        supabase.from("tasks")
          .update({ status: "done", completed_at: new Date().toISOString() })
          .in("id", data.done).eq("user_id", userId),
      );
    if (data.tomorrow.length)
      ops.push(
        supabase.from("tasks")
          .update({ scheduled_day: addDay(data.day), scheduled_start: null, scheduled_end: null })
          .in("id", data.tomorrow).eq("user_id", userId),
      );
    await Promise.all(ops);
    return { ok: true };
  });
