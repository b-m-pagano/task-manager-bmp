import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { inboxItemShape, inboxRow } from "./add-to-inbox";

export default defineTool({
  name: "import_to_inbox",
  title: "Import items to inbox",
  description:
    "Batch-import up to 25 action items gathered from other tools (emails, chat messages, docs) into the user's inbox. Skips items whose source_url is already in the inbox.",
  inputSchema: { items: z.array(z.object(inboxItemShape)).min(1).max(25) },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ items }, ctx) => {
    const sb = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;
    const { data: existing } = await sb.from("tasks").select("notes").eq("is_inbox", true).not("notes", "is", null);
    const known = new Set(
      (existing ?? []).flatMap((r) => (r.notes?.match(/^Origem:\s*(\S+)/m)?.[1] ? [r.notes.match(/^Origem:\s*(\S+)/m)![1]] : [])),
    );
    const fresh = items.filter((i) => !i.source_url || !known.has(i.source_url));
    const skipped = items.length - fresh.length;
    if (fresh.length === 0) {
      return { content: [{ type: "text", text: `Nothing new: all ${skipped} items were already in the inbox.` }], structuredContent: { created: [], skipped } };
    }
    const { data, error } = await sb.from("tasks").insert(fresh.map((i) => inboxRow(userId, i))).select("id,title");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const created = (data ?? []).map((d) => ({ id: d.id, title: d.title }));
    return {
      content: [{ type: "text", text: `Imported ${created.length} item(s) to inbox${skipped ? `, skipped ${skipped} duplicate(s)` : ""}.` }],
      structuredContent: { created, skipped },
    };
  },
});
