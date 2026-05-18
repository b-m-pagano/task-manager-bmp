import { useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { quickAddParse } from "@/lib/quick-add.functions";
import { createTask } from "@/lib/tasks.functions";

interface QuickAddBarProps {
  todayISO: string;
  onCreated?: () => void;
}

export function QuickAddBar({ todayISO, onCreated }: QuickAddBarProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const parseFn = useServerFn(quickAddParse);
  const createFn = useServerFn(createTask);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const parsed = await parseFn({ data: { text, today: todayISO } });
      await createFn({
        data: {
          title: parsed.title,
          estimated_minutes: parsed.estimated_minutes,
          scheduled_day: parsed.scheduled_day,
          priority: parsed.priority,
          due_date: parsed.due_date,
          inbox: parsed.inbox ?? false,
        },
      });
      setText("");
      toast.success(parsed.inbox ? "Adicionada à Inbox" : "Tarefa criada", {
        description: parsed.title,
      });
      qc.invalidateQueries({ queryKey: ["week"] });
      qc.invalidateQueries({ queryKey: ["inbox"] });
      onCreated?.();
    } catch (err) {
      toast.error("Quick Add falhou", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="relative">
      <Sparkles
        className={`pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary transition-opacity ${
          busy ? "animate-pulse opacity-100" : "opacity-80"
        }`}
      />
      <input
        id="quick-add-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder='Quick add — ex: "Call cliente amanhã 14h 1h"  ·  use #inbox para sem data'
        className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground/70 transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
      />
    </form>
  );
}
