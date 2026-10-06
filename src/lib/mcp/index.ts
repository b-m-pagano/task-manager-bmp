import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTasks from "./tools/list-tasks";
import addToInbox from "./tools/add-to-inbox";
import setTaskStatus from "./tools/set-task-status";
import decomposeTask from "./tools/decompose-task";
import createTaskWithSubtasks from "./tools/create-task-with-subtasks";
import listSubtasks from "./tools/list-subtasks";
import { getDayScheduleTool, replanDayTool, scheduleTaskTool } from "./tools/schedule-tools";

const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "meu-task-manager",
  title: "Meu Task Manager",
  version: "0.3.0",
  instructions:
    "Task manager for the signed-in user, designed for ADHD-friendly focus. Use `list_tasks` to read tasks, `add_task_to_inbox` to capture, `set_task_status` to mark done. When a task feels big or vague, break it into concrete 5–25 minute micro-steps (first step trivially easy) with `decompose_task`, or create a new task already broken down with `create_task_with_subtasks`. Use `list_subtasks` to check progress. For the day plan: `get_day_schedule` shows tasks and Google Calendar events (never overlap events), `schedule_task` moves one task, and `replan_day` reorganizes the rest of the day when the user is late, gets a new appointment or changes priorities.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTasks, addToInbox, setTaskStatus, decomposeTask, createTaskWithSubtasks, listSubtasks, getDayScheduleTool, scheduleTaskTool, replanDayTool],
});
