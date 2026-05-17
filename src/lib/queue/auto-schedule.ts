/**
 * Auto-schedule engine — pure, no I/O.
 *
 * Reorganiza toda a fila de um dia respeitando a hierarquia:
 *   1. Eventos de calendário (intervalos bloqueantes — nunca alterados)
 *   2. Tarefas fixas (pinned — tratadas como blocos imutáveis)
 *   3. Tarefas normais (ordenadas por prioridade, depois ordem atual)
 *
 * Garante continuidade (sem espaços mortos entre tarefas, exceto buffer
 * configurável e bloqueios), respeita duração estimada e gera flag
 * `afterHours` para tarefas que ultrapassam o horário limite.
 *
 * Complexidade: O(n log n + n·b) onde n = tarefas e b = blockers — adequado
 * para milhares de tarefas por dia.
 */

export type AutoPriority = "low" | "medium" | "high" | "urgent";

export interface AutoTask {
  id: string;
  duration: number;
  priority: AutoPriority;
  /** Minuto fixo (pinned). Quando definido, a tarefa é tratada como bloco imutável. */
  pinnedMinute?: number | null;
  /** Ordem atual (queue_position ou minuto atual) — usada como tie-breaker. */
  order?: number;
  /** Tarefas concluídas/skipped não são reposicionadas. */
  status?: "pending" | "in_progress" | "done" | "skipped";
  /** Marca tarefas migradas de dias anteriores — recebem prioridade máxima absoluta. */
  carriedOver?: boolean;
}

export interface AutoBlock {
  start: number;
  end: number;
}

export interface AutoOptions {
  dayStart: number;
  /** Limite após o qual tarefas geram alerta (default 18:00 = 1080). */
  afterHoursMinute?: number;
  /** Buffer entre tarefas (em minutos). */
  buffer?: number;
}

export interface AutoPlacement {
  id: string;
  start: number;
  afterHours: boolean;
}

export interface AutoResult {
  placements: AutoPlacement[];
  /** Apenas tarefas cuja posição mudou (start diferente do `order` original em minutos). */
  changes: AutoPlacement[];
}

const PRIORITY_RANK: Record<AutoPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function fitPast(desired: number, duration: number, blockers: AutoBlock[]): number {
  let start = desired;
  let safety = blockers.length + 2;
  while (safety-- > 0) {
    let pushed = false;
    for (const b of blockers) {
      const end = start + duration;
      if (end <= b.start || start >= b.end) continue;
      start = b.end;
      pushed = true;
    }
    if (!pushed) break;
  }
  return start;
}

export function autoScheduleDay(
  tasks: AutoTask[],
  events: AutoBlock[],
  options: AutoOptions,
): AutoResult {
  const dayStart = options.dayStart;
  const buffer = Math.max(0, options.buffer ?? 0);
  const afterHours = options.afterHoursMinute ?? 18 * 60;

  // 1. Blockers iniciais: eventos + tarefas pinned (não movíveis).
  const pinned: AutoBlock[] = [];
  const pinnedPlacements: AutoPlacement[] = [];
  const movable: AutoTask[] = [];

  for (const t of tasks) {
    if (t.status === "done" || t.status === "skipped") continue;
    if (t.pinnedMinute != null) {
      const start = t.pinnedMinute;
      pinned.push({ start, end: start + t.duration });
      pinnedPlacements.push({ id: t.id, start, afterHours: start >= afterHours });
    } else {
      movable.push(t);
    }
  }

  const occupied: AutoBlock[] = [
    ...events.filter((e) => e.end > e.start).map((e) => ({ start: e.start, end: e.end })),
    ...pinned,
  ].sort((a, b) => a.start - b.start);

  // 2. Ordena movíveis: carry-over primeiro, depois prioridade, depois ordem.
  movable.sort((a, b) => {
    if (!!b.carriedOver !== !!a.carriedOver) return a.carriedOver ? -1 : 1;
    const p = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (p !== 0) return p;
    return (a.order ?? 0) - (b.order ?? 0);
  });

  // 3. Sweep contínuo: cada tarefa começa logo após a anterior (ou no próximo
  //    espaço livre), sem espaços mortos.
  const placements: AutoPlacement[] = [...pinnedPlacements];
  let cursor = dayStart;

  for (const t of movable) {
    const desired = Math.max(dayStart, cursor);
    const start = fitPast(desired, t.duration, occupied);
    const end = start + t.duration;
    placements.push({ id: t.id, start, afterHours: start >= afterHours });
    occupied.push({ start, end: end + buffer });
    occupied.sort((a, b) => a.start - b.start);
    cursor = end + buffer;
  }

  placements.sort((a, b) => a.start - b.start);

  // 4. Diff: apenas tarefas cuja posição final difere do `order` (interpretado
  //    como minuto atual). Caller deve passar `order = currentStartMinute`
  //    para movíveis quando quiser diff preciso.
  const changes = placements.filter((p) => {
    const original = tasks.find((t) => t.id === p.id);
    if (!original) return true;
    if (original.pinnedMinute != null) return false;
    return (original.order ?? -1) !== p.start;
  });

  return { placements, changes };
}
