import { z } from "zod";

export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Day YYYY-MM-DD");
export const TimeSchema = z.string().regex(/^\d{2}:\d{2}$/).describe("Local time HH:MM");
export const PrioritySchema = z.enum(["low", "medium", "high", "urgent"]);

/** O que a IA decide no replanejamento; horários são calculados pelo motor. */
export const ReplanInstructionSchema = z.object({
  order: z.array(z.string()).describe("IDs of existing pending tasks in the desired new order (most important first)."),
  changes: z.array(z.object({
    taskId: z.string(),
    priority: PrioritySchema.nullable(),
    durationMin: z.number().int().min(5).max(720).nullable().describe("New duration, e.g. longer when running late."),
    markDone: z.boolean(),
    moveToTomorrow: z.boolean(),
  })).describe("Only tasks that change; null fields = unchanged."),
  newItems: z.array(z.object({
    title: z.string().min(1).max(200),
    durationMin: z.number().int().min(5).max(720),
    priority: PrioritySchema,
    fixedStartMinute: z.number().int().min(0).max(1439).nullable().describe("Minutes since 00:00 for a fixed-time appointment, else null."),
  })),
});
