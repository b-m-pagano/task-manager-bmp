// Shared helpers for items captured from external tools (Gmail, Slack, Notion…)
// via the multi-MCP bridge. Origin is stored in existing columns: a `fonte:<x>`
// tag and an "Origem: <url>" line in notes — no schema change needed.

export const SOURCE_TAG_PREFIX = "fonte:";
const ORIGIN_RE = /^Origem:\s*(https?:\/\/\S+)/m;

export function normalizeSource(source: string): string {
  return source.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

export function buildSourceFields(input: {
  source?: string | null;
  source_url?: string | null;
  notes?: string | null;
}) {
  const tags: string[] = [];
  const src = input.source ? normalizeSource(input.source) : "";
  if (src) tags.push(SOURCE_TAG_PREFIX + src);
  const parts: string[] = [];
  if (input.source_url) parts.push(`Origem: ${input.source_url}`);
  if (input.notes) parts.push(input.notes);
  return { tags, notes: parts.length ? parts.join("\n\n") : null };
}

export function readSource(task: { tags?: string[] | null; notes?: string | null }) {
  const tag = (task.tags ?? []).find((t) => t.startsWith(SOURCE_TAG_PREFIX));
  const url = task.notes?.match(ORIGIN_RE)?.[1] ?? null;
  return { source: tag ? tag.slice(SOURCE_TAG_PREFIX.length) : null, url };
}
