export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "pending" | "doing" | "done";

export interface CalendarCategory {
  id: string;
  name: string;
  color: string;
}

export interface CalendarProject {
  id: string;
  name: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO date YYYY-MM-DD */
  day: string;
  /** Minutes from 00:00 */
  startMinute: number;
  durationMinutes: number;
  categoryId: string;
  projectId?: string;
  status: Status;
  priority: Priority;
  /** External calendar event (read-only) */
  external?: boolean;
}
