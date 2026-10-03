import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_tasks",
  title: "List tasks",
  description: "List the signed-in user's tasks, optionally filtered by day or status.",
  inputSchema: {
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Scheduled day YYYY-MM-DD."),
    status: z.enum(["pending", "in_progress", "done", "skipped"]).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ day, status, limit }, ctx) => {
    const sb = supabaseForUser(ctx);
    let q = sb
      .from("tasks")
      .select("id,title,status,priority,scheduled_day,scheduled_start,estimated_minutes,is_inbox")
      .order("scheduled_day", { ascending: true })
      .order("queue_position", { ascending: true })
      .limit(limit ?? 50);
    if (day) q = q.eq("scheduled_day", day);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const tasks = (data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      scheduled_day: t.scheduled_day,
      scheduled_start: t.scheduled_start,
      estimated_minutes: t.estimated_minutes,
      is_inbox: t.is_inbox,
    }));
    return { content: [{ type: "text", text: JSON.stringify(tasks) }], structuredContent: { tasks } };
  },
});
