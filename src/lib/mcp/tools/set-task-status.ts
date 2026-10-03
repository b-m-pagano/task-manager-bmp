import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "set_task_status",
  title: "Set task status",
  description: "Change the status of one of the signed-in user's tasks (e.g. mark as done).",
  inputSchema: {
    task_id: z.string().uuid(),
    status: z.enum(["pending", "in_progress", "done", "skipped"]),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ task_id, status }, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("tasks")
      .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
      .eq("id", task_id)
      .select("id,title,status")
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Task not found" }], isError: true };
    return {
      content: [{ type: "text", text: `"${data.title}" is now ${data.status}.` }],
      structuredContent: { task: { id: data.id, title: data.title, status: data.status } },
    };
  },
});
