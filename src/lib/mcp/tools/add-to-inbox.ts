import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "add_task_to_inbox",
  title: "Add task to inbox",
  description: "Capture a new task in the signed-in user's inbox to be scheduled later.",
  inputSchema: {
    title: z.string().trim().min(1).max(200),
    estimated_minutes: z.number().int().min(5).max(720).optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ title, estimated_minutes, priority }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("tasks")
      .insert({
        user_id: ctx.getUserId()!,
        title,
        estimated_minutes: estimated_minutes ?? 30,
        priority: priority ?? "medium",
        scheduled_day: new Date().toISOString().slice(0, 10),
        is_inbox: true,
      })
      .select("id,title")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added "${data.title}" to inbox.` }],
      structuredContent: { task: { id: data.id, title: data.title } },
    };
  },
});
