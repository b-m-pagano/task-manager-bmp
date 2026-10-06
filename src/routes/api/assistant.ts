import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { formatTzOffset } from "@/lib/timezone";
import { createTaskWithSubtasks, getDaySchedule, listSubtasks, parseTime, replanDay, scheduleTask } from "@/lib/agent/operations";
import { ReplanInstructionSchema } from "@/lib/agent/schemas";

const Body = z.object({
  threadId: z.string().uuid(),
  messages: z.array(z.any()),
  tz_offset_minutes: z.number().int(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  now: z.string(),
});

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Dia AAAA-MM-DD");
const Time = z.string().regex(/^\d{2}:\d{2}$/).describe("Hora HH:MM local");

export const Route = createFileRoute("/api/assistant")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!token || !url || !key) return new Response("Unauthorized", { status: 401 });
        if (!apiKey) return new Response("IA não configurada", { status: 500 });
        const sb = createClient<Database>(url, key, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: claims } = await sb.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const parsed = Body.safeParse(await request.json());
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { threadId, tz_offset_minutes: tz, today, now } = parsed.data;
        const messages = parsed.data.messages as UIMessage[];

        const { data: thread } = await sb.from("assistant_threads").select("id,title").eq("id", threadId).maybeSingle();
        if (!thread) return new Response("Conversa não encontrada", { status: 404 });

        const off = formatTzOffset(tz);
        const stamp = (day: string, t: string) => `${day}T${t}:00${off}`;
        const addMin = (day: string, t: string, m: number) =>
          new Date(new Date(stamp(day, t)).getTime() + m * 60000).toISOString();
        const localTime = (iso: string | null) => {
          if (!iso) return null;
          const d = new Date(new Date(iso).getTime() + tz * 60000);
          return d.toISOString().slice(11, 16);
        };
        const fail = (e: { message: string } | null) => (e ? { error: e.message } : null);

        const tools = {
          list_tasks: tool({
            description: "Lista tarefas do usuário. Filtre por dia ou situação. Use para achar IDs.",
            inputSchema: z.object({
              day: Day.nullable(),
              status: z.enum(["pending", "in_progress", "done", "skipped"]).nullable(),
              search: z.string().nullable().describe("Trecho do título"),
            }),
            execute: async ({ day, status, search }) => {
              let q = sb.from("tasks")
                .select("id,title,status,priority,scheduled_day,scheduled_start,estimated_minutes,is_inbox,parent_id")
                .order("scheduled_day").order("queue_position").limit(60);
              if (day) q = q.eq("scheduled_day", day);
              if (status) q = q.eq("status", status);
              if (search) q = q.ilike("title", `%${search}%`);
              const { data, error } = await q;
              return fail(error) ?? (data ?? []).map((t) => ({ ...t, scheduled_start: localTime(t.scheduled_start) }));
            },
          }),
          get_day_schedule: tool({
            description: "Agenda de um dia: tarefas e eventos do Google Calendar (eventos são intocáveis).",
            inputSchema: z.object({ day: Day }),
            execute: async ({ day }) => {
              try { const r = await getDaySchedule(sb, day, tz); return { tasks: r.tasks, calendar: r.calendar }; }
              catch (e) { return { error: (e as Error).message }; }
            },
          }),
          replan_day: tool({
            description: "Reorganiza e SALVA o restante do dia (atrasos, compromissos novos, prioridades). Você decide ordem/prioridade/duração/novos itens; o app calcula os horários sem sobrepor o Google Calendar. Chame get_day_schedule antes.",
            inputSchema: z.object({ day: Day, instruction: ReplanInstructionSchema }),
            execute: async ({ day, instruction }) => {
              try { return await replanDay(sb, userId, { day, now_minute: day === today ? parseTime(now) : 0, tz, instruction }); }
              catch (e) { return { error: (e as Error).message }; }
            },
          }),
          list_subtasks: tool({
            description: "Mostra os micro-passos de uma tarefa e o progresso.",
            inputSchema: z.object({ task_id: z.string().uuid() }),
            execute: async ({ task_id }) => {
              try { return await listSubtasks(sb, task_id); } catch (e) { return { error: (e as Error).message }; }
            },
          }),
          create_task_with_subtasks: tool({
            description: "Cria uma tarefa nova já com checklist de micro-passos (5–25 min). Sem dia vai para a Inbox.",
            inputSchema: z.object({
              title: z.string().min(1).max(200),
              steps: z.array(z.object({ title: z.string().min(1).max(200), estimated_minutes: z.number().int().min(5).max(25) })).min(1).max(12),
              day: Day.nullable(),
              priority: z.enum(["low", "medium", "high", "urgent"]).nullable(),
            }),
            execute: async (a) => {
              try { return await createTaskWithSubtasks(sb, userId, a); } catch (e) { return { error: (e as Error).message }; }
            },
          }),
          create_task: tool({
            description: "Cria uma tarefa. Sem dia vai para a Inbox. Com hora fica agendada nesse horário.",
            inputSchema: z.object({
              title: z.string().min(1).max(200),
              estimated_minutes: z.number().int().min(5).max(720),
              priority: z.enum(["low", "medium", "high", "urgent"]),
              day: Day.nullable(),
              start_time: Time.nullable(),
            }),
            execute: async ({ title, estimated_minutes, priority, day, start_time }) => {
              const { data, error } = await sb.from("tasks").insert({
                user_id: userId, title, estimated_minutes, priority,
                scheduled_day: day ?? undefined, is_inbox: !day,
                scheduled_start: day && start_time ? stamp(day, start_time) : null,
                scheduled_end: day && start_time ? addMin(day, start_time, estimated_minutes) : null,
              }).select("id,title").single();
              return fail(error) ?? { created: data };
            },
          }),
          decompose_task: tool({
            description: "Quebra uma tarefa existente em micro-passos (subtarefas de 5 a 25 min).",
            inputSchema: z.object({
              task_id: z.string().uuid(),
              steps: z.array(z.object({ title: z.string().min(1).max(200), estimated_minutes: z.number().int().min(5).max(25) })).min(1).max(12),
            }),
            execute: async ({ task_id, steps }) => {
              const { data: p, error: pe } = await sb.from("tasks")
                .select("id,title,scheduled_day,priority,category_id,project_id,parent_id").eq("id", task_id).maybeSingle();
              if (pe || !p) return { error: pe?.message ?? "Tarefa não encontrada" };
              if (p.parent_id) return { error: "Essa já é uma subtarefa." };
              const { count } = await sb.from("tasks").select("id", { count: "exact", head: true }).eq("parent_id", task_id);
              const { data, error } = await sb.from("tasks").insert(steps.map((s, i) => ({
                user_id: userId, parent_id: p.id, title: s.title, estimated_minutes: s.estimated_minutes,
                priority: p.priority, scheduled_day: p.scheduled_day, category_id: p.category_id,
                project_id: p.project_id, queue_position: (count ?? 0) + i,
              }))).select("id,title,estimated_minutes");
              return fail(error) ?? { parent: p.title, subtasks: data };
            },
          }),
          set_task_status: tool({
            description: "Muda a situação de uma tarefa (ex.: concluída = done).",
            inputSchema: z.object({ task_id: z.string().uuid(), status: z.enum(["pending", "in_progress", "done", "skipped"]) }),
            execute: async ({ task_id, status }) => {
              const { error } = await sb.from("tasks").update({
                status, completed_at: status === "done" ? new Date().toISOString() : null,
              }).eq("id", task_id);
              return fail(error) ?? { ok: true };
            },
          }),
          move_task: tool({
            description: "Move/agenda uma tarefa para um dia e, opcionalmente, um horário. Nunca sobreponha eventos do calendário.",
            inputSchema: z.object({ task_id: z.string().uuid(), day: Day, start_time: Time.nullable() }),
            execute: async ({ task_id, day, start_time }) => {
              try { return await scheduleTask(sb, { task_id, day, start_time, tz }); } catch (e) { return { error: (e as Error).message }; }
            },
          }),
        };

        const openai = createOpenAI({
          baseURL: "https://ai.gateway.lovable.dev/v1",
          apiKey,
          headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
        });

        const result = streamText({
          model: openai.responses("openai/gpt-6-astra"),
          system:
            `Você é o assistente do BMP Task Manager, para um usuário com TDAH. Responda em português, curto e calmo. ` +
            `Hoje é ${today}, agora são ${now} (horário local). Expediente 07:00–18:00; avise se algo passar das 18h. ` +
            `Use as ferramentas para ler e alterar tarefas; antes de mexer numa tarefa, encontre o ID com list_tasks. ` +
            `Eventos do Google Calendar nunca podem ser alterados nem sobrepostos. Ao quebrar tarefas, use passos concretos de até 20 min (decompose_task ou create_task_with_subtasks). Para atrasos, compromissos novos ou mudanças de prioridade, use replan_day (os horários são calculados pelo app). ` +
            `Depois de agir, diga em uma ou duas frases o que mudou.`,
          messages: await convertToModelMessages(messages),
          tools,
          stopWhen: stepCountIs(8),
          abortSignal: request.signal,
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

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: all }) => {
            const base = Date.now() - all.length;
            const rows = all.map((m, i) => ({
              thread_id: threadId, user_id: userId, message_id: m.id, message: m as never,
              created_at: new Date(base + i).toISOString(),
            }));
            const { error } = await sb.from("assistant_messages").upsert(rows, { onConflict: "thread_id,message_id" });
            if (error) console.error("[assistant] save failed", error.message);
            const firstUser = all.find((m) => m.role === "user");
            const text = firstUser?.parts.find((p) => p.type === "text");
            const patch: { updated_at: string; title?: string } = { updated_at: new Date().toISOString() };
            if (thread.title === "Nova conversa" && text && "text" in text) patch.title = text.text.slice(0, 60);
            await sb.from("assistant_threads").update(patch).eq("id", threadId);
          },
        });
      },
    },
  },
});
