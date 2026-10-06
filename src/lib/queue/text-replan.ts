/**
 * Text replan engine — pure, no I/O.
 *
 * Recebe a interpretação estruturada (feita pela IA) de um pedido em texto
 * livre e monta a agenda restante do dia. A IA só decide ORDEM, PRIORIDADE,
 * DURAÇÃO e NOVOS ITENS; os horários são sempre calculados aqui, para
 * garantir matematicamente que nada sobreponha eventos do calendário.
 */

export interface ReplanTask {
  id: string;
  title: string;
  duration: number;
  priority: "low" | "medium" | "high" | "urgent";
  startMinute: number | null;
}

export interface ReplanBlock {
  start: number;
  end: number;
}

export interface ReplanInstruction {
  /** Ordem desejada das tarefas existentes (ids). Ids ausentes vão para o fim. */
  order: string[];
  changes: {
    taskId: string;
    priority: ReplanTask["priority"] | null;
    durationMin: number | null;
    markDone: boolean;
    moveToTomorrow: boolean;
  }[];
  /** Novas tarefas/compromissos. fixedStartMinute != null = compromisso com hora marcada. */
  newItems: {
    title: string;
    durationMin: number;
    priority: ReplanTask["priority"];
    fixedStartMinute: number | null;
  }[];
}

export interface ReplanPlacement {
  /** id existente, ou "new:<i>" para novos itens. */
  id: string;
  title: string;
  start: number;
  duration: number;
  priority: ReplanTask["priority"];
  isNew: boolean;
  fixed: boolean;
  previousStart: number | null;
  afterHours: boolean;
}

export interface ReplanResult {
  placements: ReplanPlacement[];
  done: { id: string; title: string }[];
  tomorrow: { id: string; title: string }[];
  /** Itens que não couberam antes do fim do dia (vão para amanhã). */
  overflow: { id: string; title: string }[];
}

export function fitAfter(desired: number, duration: number, occupied: ReplanBlock[]): number {
  let start = desired;
  for (let guard = 0; guard < occupied.length + 2; guard++) {
    let pushed = false;
    for (const b of occupied) {
      if (start + duration <= b.start || start >= b.end) continue;
      start = b.end;
      pushed = true;
    }
    if (!pushed) break;
  }
  return start;
}

export function buildTextReplan(
  tasks: ReplanTask[],
  events: ReplanBlock[],
  instr: ReplanInstruction,
  opts: { fromMinute: number; dayEnd?: number; afterHours?: number; buffer?: number },
): ReplanResult {
  const dayEnd = opts.dayEnd ?? 24 * 60;
  const afterHours = opts.afterHours ?? 18 * 60;
  const buffer = Math.max(0, opts.buffer ?? 0);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const changeById = new Map(instr.changes.map((c) => [c.taskId, c]));

  const done: ReplanResult["done"] = [];
  const tomorrow: ReplanResult["tomorrow"] = [];
  const overflow: ReplanResult["overflow"] = [];

  const occupied: ReplanBlock[] = events
    .filter((e) => e.end > e.start)
    .map((e) => ({ ...e }));
  const placements: ReplanPlacement[] = [];

  // Compromissos novos com hora marcada viram blocos fixos (respeitando eventos).
  instr.newItems.forEach((n, i) => {
    if (n.fixedStartMinute == null) return;
    const start = fitAfter(n.fixedStartMinute, n.durationMin, occupied);
    occupied.push({ start, end: start + n.durationMin });
    placements.push({
      id: `new:${i}`,
      title: n.title,
      start,
      duration: n.durationMin,
      priority: n.priority,
      isNew: true,
      fixed: true,
      previousStart: null,
      afterHours: start + n.durationMin > afterHours,
    });
  });

  // Fila móvel: ordem da IA, depois as restantes na ordem atual.
  const orderedIds = [
    ...instr.order.filter((id) => byId.has(id)),
    ...tasks
      .slice()
      .sort((a, b) => (a.startMinute ?? 9999) - (b.startMinute ?? 9999))
      .map((t) => t.id)
      .filter((id) => !instr.order.includes(id)),
  ];
  const queue: { id: string; title: string; duration: number; priority: ReplanTask["priority"]; prev: number | null; isNew: boolean }[] = [];
  for (const id of new Set(orderedIds)) {
    const t = byId.get(id)!;
    const c = changeById.get(id);
    if (c?.markDone) { done.push({ id, title: t.title }); continue; }
    if (c?.moveToTomorrow) { tomorrow.push({ id, title: t.title }); continue; }
    queue.push({
      id,
      title: t.title,
      duration: Math.max(5, c?.durationMin ?? t.duration),
      priority: c?.priority ?? t.priority,
      prev: t.startMinute,
      isNew: false,
    });
  }
  instr.newItems.forEach((n, i) => {
    if (n.fixedStartMinute != null) return;
    queue.push({ id: `new:${i}`, title: n.title, duration: Math.max(5, n.durationMin), priority: n.priority, prev: null, isNew: true });
  });

  let cursor = opts.fromMinute;
  for (const q of queue) {
    const start = fitAfter(cursor, q.duration, occupied);
    if (start + q.duration > dayEnd) {
      overflow.push({ id: q.id, title: q.title });
      continue;
    }
    occupied.push({ start, end: start + q.duration + buffer });
    cursor = start + q.duration + buffer;
    placements.push({
      id: q.id,
      title: q.title,
      start,
      duration: q.duration,
      priority: q.priority,
      isNew: q.isNew,
      fixed: false,
      previousStart: q.prev,
      afterHours: start + q.duration > afterHours,
    });
  }

  placements.sort((a, b) => a.start - b.start);
  return { placements, done, tomorrow, overflow };
}
