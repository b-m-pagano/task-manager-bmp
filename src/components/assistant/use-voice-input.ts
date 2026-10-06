import { useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { recordWav } from "@/lib/record-wav";

type State = "idle" | "recording" | "transcribing";

/** Mic → transcript. Calls onText with the final transcript. */
export function useVoiceInput(onText: (text: string) => void, onPartial?: (text: string) => void) {
  const [state, setState] = useState<State>("idle");
  const rec = useRef<{ stop: () => Promise<File> } | null>(null);

  async function start() {
    if (state !== "idle") return;
    try {
      rec.current = await recordWav();
      setState("recording");
    } catch {
      toast.error("Não consegui acessar o microfone", { description: "Permita o uso do microfone no navegador." });
    }
  }

  async function stop() {
    if (state !== "recording" || !rec.current) return;
    setState("transcribing");
    try {
      const file = await rec.current.stop();
      rec.current = null;
      const { data } = await supabase.auth.getSession();
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: form,
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Erro ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "", partial = "", final = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === "[DONE]") continue;
          try {
            const ev = JSON.parse(raw) as { type?: string; delta?: string; text?: string; error?: { message?: string } };
            if (ev.type === "transcript.text.delta" && ev.delta) { partial += ev.delta; onPartial?.(partial); }
            else if (ev.type === "transcript.text.done") final = ev.text ?? partial;
            else if (ev.error) throw new Error(ev.error.message ?? "Falha na transcrição");
          } catch (e) { if (e instanceof Error && e.message !== "Unexpected end of JSON input" && !(e instanceof SyntaxError)) throw e; }
        }
      }
      const text = (final || partial).trim();
      if (!text) throw new Error("Não entendi nada na gravação. Tente falar de novo.");
      onText(text);
    } catch (e) {
      toast.error("Falha ao transcrever", { description: (e as Error).message });
    } finally {
      setState("idle");
    }
  }

  return { state, start, stop, toggle: () => (state === "recording" ? stop() : start()) };
}
