import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasks from "./tools/list-tasks";
import addToInbox from "./tools/add-to-inbox";
import setTaskStatus from "./tools/set-task-status";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "meu-task-manager",
  title: "Meu Task Manager",
  version: "0.1.0",
  instructions:
    "Task manager tools for the signed-in user. Use `list_tasks` to read tasks, `add_task_to_inbox` to capture new tasks, and `set_task_status` to mark tasks done.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTasks, addToInbox, setTaskStatus],
});
