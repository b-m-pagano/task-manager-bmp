import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { getDaySchedule, replanDay, scheduleTask } from "@/lib/agent/operations";
import { DaySchema, ReplanInstructionSchema, TimeSchema } from "@/lib/agent/schemas";

const tzField = z.number().int().min(-720).max(840).optional()
  .describe("User UTC offset in minutes (São Paulo = -180). Defaults to -180.");
const err = (e: unknown) => ({ content: [{ type: "text" as const, text: (e as Error).message }], isError: true });

export const getDayScheduleTool = defineTool({
  name: "get_day_schedule",
  title: "Get day schedule",
  description: "Read one day's tasks plus Google Calendar events (events are fixed and must never be overlapped).",
  inputSchema: { day: DaySchema, tz_offset_minutes: tzField },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ day, tz_offset_minutes }, ctx) => {
    if (!ctx.isAuthenticated()) return err(new Error("Not authenticated"));
    try {
      const { tasks, calendar } = await getDaySchedule(supabaseForUser(ctx), day, tz_offset_minutes ?? -180);
      return { content: [{ type: "text", text: JSON.stringify({ tasks, calendar }) }], structuredContent: { tasks, calendar } };
    } catch (e) { return err(e); }
  },
});

export const scheduleTaskTool = defineTool({
  name: "schedule_task",
  title: "Schedule task",
  description: "Move a task to a day and optionally a start time.",
  inputSchema: { task_id: z.string().uuid(), day: DaySchema, start_time: TimeSchema.optional(), tz_offset_minutes: tzField },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ task_id, day, start_time, tz_offset_minutes }, ctx) => {
    if (!ctx.isAuthenticated()) return err(new Error("Not authenticated"));
    try {
      await scheduleTask(supabaseForUser(ctx), { task_id, day, start_time: start_time ?? null, tz: tz_offset_minutes ?? -180 });
      return { content: [{ type: "text", text: `Scheduled on ${day}${start_time ? ` at ${start_time}` : ""}.` }] };
    } catch (e) { return err(e); }
  },
});

export const replanDayTool = defineTool({
  name: "replan_day",
  title: "Replan rest of day",
  description:
    "Reorganize the rest of a day and save it. You decide order, priority, durations, done/tomorrow and new items; the app computes start times so nothing overlaps Google Calendar events. Call get_day_schedule first.",
  inputSchema: {
    day: DaySchema,
    now_time: TimeSchema.describe("Current local time; only the time after it is replanned."),
    instruction: ReplanInstructionSchema,
    tz_offset_minutes: tzField,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ day, now_time, instruction, tz_offset_minutes }, ctx) => {
    if (!ctx.isAuthenticated()) return err(new Error("Not authenticated"));
    try {
      const nowMinute = Number(now_time.slice(0, 2)) * 60 + Number(now_time.slice(3, 5));
      const r = await replanDay(supabaseForUser(ctx), ctx.getUserId()!, {
        day, now_minute: nowMinute, tz: tz_offset_minutes ?? -180, instruction,
      });
      return { content: [{ type: "text", text: JSON.stringify(r) }], structuredContent: r };
    } catch (e) { return err(e); }
  },
});
