import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { generateText, Output } from "ai";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createLovableAiGatewayProvider } from "./ai-gateway";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const ParseSchema = z.object({
  title: z.string().min(1).max(200),
  estimated_minutes: z.number().int().min(5).max(720),
  scheduled_day: z.string().regex(ISO_DATE),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  due_date: z.string().regex(ISO_DATE).nullable(),
  category_hint: z.string().nullable(),
});

export const quickAddParse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        text: z.string().min(1).max(500),
        today: z.string().regex(ISO_DATE),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // Detect "#inbox" hashtag → mark task as inbox, strip from text before LLM.
    const inboxMatch = /(^|\s)#inbox\b/i.test(data.text);
    const cleanText = data.text.replace(/(^|\s)#inbox\b/gi, " ").trim();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");
    const gateway = createLovableAiGatewayProvider(key);

    const { experimental_output: out } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema: ParseSchema }),
      system:
        "Você é um parser de tarefas. Sempre responda em PT-BR. " +
        `Hoje é ${data.today} (use como referência para 'hoje', 'amanhã', 'sexta', etc.). ` +
        "Se duração não for clara, use 30 min. Prioridade default 'medium'.",
      prompt: `Texto livre: "${cleanText || data.text}"\n\nExtraia: title (sem datas/horários), estimated_minutes, scheduled_day, priority, due_date (ou null), category_hint (ou null).`,
    });

    return { ...out, inbox: inboxMatch };
  });
