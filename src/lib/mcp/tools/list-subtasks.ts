import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { toSubtaskJson } from "./subtask-shared";

export default defineTool({
  name: "list_subtasks",
  title: "List subtasks",
  description: "List the micro-steps of a task with their progress.",
  inputSchema: { task_id: z.string().uuid() },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("tasks")
      .select("id,title,status,estimated_minutes")
      .eq("parent_id", task_id)
      .order("queue_position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const subtasks = (data ?? []).map(toSubtaskJson);
    const done = subtasks.filter((s) => s.status === "done").length;
    return {
      content: [{ type: "text", text: `${done}/${subtasks.length} done. ${JSON.stringify(subtasks)}` }],
      structuredContent: { done, total: subtasks.length, subtasks },
    };
  },
});
