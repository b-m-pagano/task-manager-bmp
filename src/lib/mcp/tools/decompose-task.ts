import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { stepsSchema, toSubtaskJson } from "./subtask-shared";

export default defineTool({
  name: "decompose_task",
  title: "Decompose task into micro-steps",
  description:
    "Break an existing task into small ordered subtasks (5–25 min each) to reduce overwhelm and procrastination.",
  inputSchema: {
    task_id: z.string().uuid().describe("ID of the parent task (use list_tasks to find it)."),
    steps: stepsSchema,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ task_id, steps }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const sb = supabaseForUser(ctx);
    const { data: parent, error: pErr } = await sb
      .from("tasks")
      .select("id,title,scheduled_day,priority,category_id,project_id,parent_id")
      .eq("id", task_id)
      .maybeSingle();
    if (pErr) return { content: [{ type: "text", text: pErr.message }], isError: true };
    if (!parent) return { content: [{ type: "text", text: "Task not found." }], isError: true };
    if (parent.parent_id)
      return { content: [{ type: "text", text: "This task is already a subtask; decompose its parent instead." }], isError: true };

    const { count } = await sb
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", task_id);
    const base = count ?? 0;

    const rows = steps.map((s, i) => ({
      user_id: ctx.getUserId()!,
      parent_id: parent.id,
      title: s.title,
      estimated_minutes: s.estimated_minutes ?? 15,
      priority: parent.priority,
      scheduled_day: parent.scheduled_day,
      category_id: parent.category_id,
      project_id: parent.project_id,
      queue_position: base + i,
    }));
    const { data, error } = await sb
      .from("tasks")
      .insert(rows)
      .select("id,title,status,estimated_minutes");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const subtasks = (data ?? []).map(toSubtaskJson);
    const total = subtasks.reduce((a, s) => a + s.estimated_minutes, 0);
    return {
      content: [
        {
          type: "text",
          text: `Added ${subtasks.length} micro-steps (${total} min total) to "${parent.title}".`,
        },
      ],
      structuredContent: { parent: { id: parent.id, title: parent.title }, subtasks },
    };
  },
});
