import listTasks from "./list-tasks";
import addToInbox from "./add-to-inbox";
import importToInbox from "./import-to-inbox";
import setTaskStatus from "./set-task-status";
import decomposeTask from "./decompose-task";
import createTaskWithSubtasks from "./create-task-with-subtasks";
import listSubtasks from "./list-subtasks";
import { getDayScheduleTool, replanDayTool, scheduleTaskTool } from "./schedule-tools";

/** Single list of MCP tools — used by the MCP server and the in-app test panel. */
export const mcpTools = [
  listTasks, addToInbox, importToInbox, setTaskStatus, decomposeTask,
  createTaskWithSubtasks, listSubtasks, getDayScheduleTool, scheduleTaskTool, replanDayTool,
];
