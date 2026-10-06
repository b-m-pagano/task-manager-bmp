import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { buildSourceFields } from "@/lib/inbox-source";

export const inboxItemShape = {
  title: z.string().trim().min(1).max(200).describe("Short actionable task title."),
  description: z.string().trim().max(500).optional().describe("One-line summary of what needs to be done."),
  notes: z.string().trim().max(4000).optional().describe("Context: sender, relevant excerpt, deadline mentioned."),
  estimated_minutes: z.number().int().min(5).max(720).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  source: z.string().trim().max(30).optional().describe("Origin tool, e.g. gmail, slack, notion, github."),
  source_url: z.string().url().max(2000).optional().describe("Direct link to the original email/message/page."),
};

export function inboxRow(userId: string, item: {
  title: string; description?: string; notes?: string; estimated_minutes?: number;
  priority?: "low" | "medium" | "high" | "urgent"; source?: string; source_url?: string;
}) {
  const { tags, notes } = buildSourceFields(item);
  return {
    user_id: userId,
    title: item.title,
    description: item.description ?? null,
    notes,
    tags,
    estimated_minutes: item.estimated_minutes ?? 30,
    priority: item.priority ?? "medium",
    scheduled_day: new Date().toISOString().slice(0, 10),
    is_inbox: true,
  };
}

export default defineTool({
  name: "add_task_to_inbox",
  title: "Add task to inbox",
  description: "Capture one task in the user's inbox, optionally with its origin tool and a link to the original item.",
  inputSchema: inboxItemShape,
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (item, ctx) => {
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb.from("tasks").insert(inboxRow(ctx.getUserId()!, item)).select("id,title").single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added "${data.title}" to inbox.` }],
      structuredContent: { task: { id: data.id, title: data.title } },
    };
  },
});
