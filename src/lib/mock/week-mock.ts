import { addDays, startOfWeek } from "date-fns";

export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "pending" | "doing" | "done";

export interface MockCategory {
  id: string;
  name: string;
  color: string;
}

export interface MockProject {
  id: string;
  name: string;
}

export interface MockEvent {
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

export const mockCategories: MockCategory[] = [
  { id: "personal", name: "Pessoal", color: "oklch(0.7 0.16 200)" },
  { id: "company-a", name: "Empresa A", color: "oklch(0.65 0.2 280)" },
  { id: "company-b", name: "Empresa B", color: "oklch(0.7 0.18 30)" },
  { id: "health", name: "Saúde", color: "oklch(0.7 0.15 160)" },
];

export const mockProjects: MockProject[] = [
  { id: "p1", name: "Lançamento Q3" },
  { id: "p2", name: "Refatoração API" },
  { id: "p3", name: "Onboarding clientes" },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildMockEvents(anchor: Date): MockEvent[] {
  const monday = startOfWeek(anchor, { weekStartsOn: 1 });
  const d = (i: number) => iso(addDays(monday, i));

  return [
    // segunda
    { id: "e1", title: "Deep work — refator API", day: d(0), startMinute: 9 * 60, durationMinutes: 90, categoryId: "company-a", projectId: "p2", status: "doing", priority: "high" },
    { id: "e2", title: "Reunião time", day: d(0), startMinute: 11 * 60, durationMinutes: 45, categoryId: "company-a", status: "pending", priority: "medium", external: true },
    { id: "e3", title: "Almoço", day: d(0), startMinute: 12 * 60 + 30, durationMinutes: 60, categoryId: "personal", status: "pending", priority: "low" },
    { id: "e4", title: "Revisar PRs", day: d(0), startMinute: 15 * 60, durationMinutes: 60, categoryId: "company-a", projectId: "p2", status: "pending", priority: "medium" },
    { id: "e5", title: "Estudar TanStack", day: d(0), startMinute: 19 * 60 + 30, durationMinutes: 60, categoryId: "personal", status: "pending", priority: "low" },

    // terça
    { id: "e6", title: "1:1 com gestor", day: d(1), startMinute: 9 * 60, durationMinutes: 30, categoryId: "company-a", status: "pending", priority: "high", external: true },
    { id: "e7", title: "Escrever proposta Empresa B", day: d(1), startMinute: 10 * 60, durationMinutes: 120, categoryId: "company-b", projectId: "p3", status: "pending", priority: "urgent" },
    { id: "e8", title: "Academia", day: d(1), startMinute: 18 * 60 + 30, durationMinutes: 75, categoryId: "health", status: "pending", priority: "medium" },

    // quarta
    { id: "e9", title: "Planejamento sprint", day: d(2), startMinute: 9 * 60 + 30, durationMinutes: 90, categoryId: "company-a", projectId: "p1", status: "pending", priority: "high" },
    { id: "e10", title: "Call cliente Empresa B", day: d(2), startMinute: 14 * 60, durationMinutes: 60, categoryId: "company-b", projectId: "p3", status: "pending", priority: "urgent", external: true },
    { id: "e11", title: "Consulta médica", day: d(2), startMinute: 17 * 60, durationMinutes: 60, categoryId: "health", status: "pending", priority: "medium" },

    // quinta
    { id: "e12", title: "Code review profundo", day: d(3), startMinute: 8 * 60 + 30, durationMinutes: 90, categoryId: "company-a", projectId: "p2", status: "done", priority: "medium" },
    { id: "e13", title: "Demo interna", day: d(3), startMinute: 11 * 60, durationMinutes: 45, categoryId: "company-a", projectId: "p1", status: "pending", priority: "high" },
    { id: "e14", title: "Estudo arquitetura", day: d(3), startMinute: 15 * 60, durationMinutes: 120, categoryId: "personal", status: "pending", priority: "low" },
    { id: "e15", title: "Jantar com família", day: d(3), startMinute: 20 * 60, durationMinutes: 90, categoryId: "personal", status: "pending", priority: "low" },

    // sexta
    { id: "e16", title: "Retro da semana", day: d(4), startMinute: 9 * 60, durationMinutes: 60, categoryId: "company-a", status: "pending", priority: "medium" },
    { id: "e17", title: "Documentação Empresa B", day: d(4), startMinute: 10 * 60 + 30, durationMinutes: 120, categoryId: "company-b", projectId: "p3", status: "pending", priority: "high" },
    { id: "e18", title: "Foco livre", day: d(4), startMinute: 14 * 60, durationMinutes: 90, categoryId: "personal", status: "pending", priority: "low" },

    // sábado
    { id: "e19", title: "Corrida no parque", day: d(5), startMinute: 8 * 60, durationMinutes: 60, categoryId: "health", status: "pending", priority: "medium" },
    { id: "e20", title: "Projeto pessoal", day: d(5), startMinute: 10 * 60, durationMinutes: 180, categoryId: "personal", status: "pending", priority: "low" },
  ];
}
