import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { stepsSchema, toSubtaskJson } from "./subtask-shared";

export default defineTool({
  name: "create_task_with_subtasks",
  title: "Create task with micro-steps",
  description:
    "Create a new task together with an ordered checklist of small subtasks; goes to the inbox unless a day is given.",
  inputSchema: {
    title: z.string().trim().min(1).max(200),
    steps: stepsSchema,
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Scheduled day YYYY-MM-DD. Omit to capture in the inbox."),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, steps, day, priority }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const scheduledDay = day ?? new Date().toISOString().slice(0, 10);
    const prio = priority ?? "medium";
    const total = steps.reduce((a, s) => a + (s.estimated_minutes ?? 15), 0);

    const { data: parent, error: pErr } = await sb
      .from("tasks")
      .insert({
        user_id: userId,
        title,
        estimated_minutes: Math.min(720, Math.max(5, total)),
        priority: prio,
        scheduled_day: scheduledDay,
        is_inbox: !day,
      })
      .select("id,title")
      .single();
    if (pErr) return { content: [{ type: "text", text: pErr.message }], isError: true };

    const { data, error } = await sb
      .from("tasks")
      .insert(
        steps.map((s, i) => ({
          user_id: userId,
          parent_id: parent.id,
          title: s.title,
          estimated_minutes: s.estimated_minutes ?? 15,
          priority: prio,
          scheduled_day: scheduledDay,
          queue_position: i,
        })),
      )
      .select("id,title,status,estimated_minutes");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const subtasks = (data ?? []).map(toSubtaskJson);
    return {
      content: [
        {
          type: "text",
          text: `Created "${parent.title}" with ${subtasks.length} micro-steps (${total} min)${day ? ` on ${day}` : " in the inbox"}.`,
        },
      ],
      structuredContent: { parent: { id: parent.id, title: parent.title }, subtasks },
    };
  },
});
