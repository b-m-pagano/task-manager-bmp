import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { mcpTools } from "./tools/registry";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "meu-task-manager",
  title: "Meu Task Manager",
  version: "0.4.0",
  instructions:
    "Task manager for the signed-in user, designed for ADHD-friendly focus. Use `list_tasks` to read tasks, `add_task_to_inbox` to capture, `set_task_status` to mark done. When a task feels big or vague, break it into concrete 5–25 minute micro-steps (first step trivially easy) with `decompose_task`, or create a new task already broken down with `create_task_with_subtasks`. Use `list_subtasks` to check progress. For the day plan: `get_day_schedule` shows tasks and Google Calendar events (never overlap events), `schedule_task` moves one task, and `replan_day` reorganizes the rest of the day when the user is late, gets a new appointment or changes priorities. Bridge with other tools: when the user asks to bring pending items from email (Gmail/Outlook), chat (Slack/Teams), docs (Notion/Drive) or code (GitHub), read them with that other connector, keep only items that require an action from the user, write a short actionable title in the user's language, a one-line description, the sender/context in notes, a realistic estimate and priority, then send them all at once with `import_to_inbox`, always filling `source` and `source_url` (link to the original item). Duplicates by link are skipped automatically.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: mcpTools,
});
