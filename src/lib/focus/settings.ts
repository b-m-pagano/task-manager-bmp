/**
 * Focus Mode settings — isolado do scheduler/fila.
 * Persistido em localStorage; não afeta a duração estimada da tarefa
 * nem o auto-schedule. Apenas controla o timer da página /app/focus.
 */
import { useCallback, useEffect, useState } from "react";

export type FocusDurationSource = "estimate" | "fixed";

export interface FocusSettings {
  /** "estimate" = usa estimated_minutes da tarefa; "fixed" = usa focusMinutes */
  source: FocusDurationSource;
  /** Duração fixa (min) quando source === "fixed" */
  focusMinutes: number;
  /** Pausa curta (min) */
  shortBreakMinutes: number;
  /** Pausa longa (min) */
  longBreakMinutes: number;
  /** Sessões até pausa longa */
  sessionsUntilLongBreak: number;
  /** Iniciar pausa automaticamente após concluir */
  autoStartBreak: boolean;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  source: "estimate",
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
  autoStartBreak: true,
};

const KEY = "focusqueue.focus-settings.v1";

function read(): FocusSettings {
  if (typeof window === "undefined") return DEFAULT_FOCUS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_FOCUS_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_FOCUS_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_FOCUS_SETTINGS;
  }
}

export function useFocusSettings() {
  const [settings, setSettings] = useState<FocusSettings>(DEFAULT_FOCUS_SETTINGS);

  useEffect(() => {
    setSettings(read());
  }, []);

  const update = useCallback((patch: Partial<FocusSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_FOCUS_SETTINGS);
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  return { settings, update, reset };
}

/** Resolve a duração do timer (segundos) para uma tarefa, dado os ajustes. */
export function resolveFocusSeconds(
  settings: FocusSettings,
  taskEstimatedMinutes: number,
): number {
  const minutes =
    settings.source === "fixed"
      ? settings.focusMinutes
      : Math.max(1, taskEstimatedMinutes || settings.focusMinutes);
  return Math.max(60, minutes * 60);
}
