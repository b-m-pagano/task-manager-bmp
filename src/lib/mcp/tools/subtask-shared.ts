import { z } from "zod";

/** Micro-step schema shared by decomposition tools (ADHD-friendly: 5–25 min). */
export const stepSchema = z.object({
  title: z.string().trim().min(1).max(200).describe("Concrete, action-first micro-step."),
  estimated_minutes: z
    .number()
    .int()
    .min(5)
    .max(25)
    .optional()
    .describe("Minutes for this step (5–25). Defaults to 15."),
});

export const stepsSchema = z
  .array(stepSchema)
  .min(1)
  .max(12)
  .describe("Ordered list of micro-steps, first step should be trivially easy to start.");

export const toSubtaskJson = (t: {
  id: string;
  title: string;
  status: string;
  estimated_minutes: number;
}) => ({ id: t.id, title: t.title, status: t.status, estimated_minutes: t.estimated_minutes });
