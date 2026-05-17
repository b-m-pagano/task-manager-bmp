import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Calendar, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { syncCalendarRange } from "@/lib/calendar.functions";

interface Props {
  from: string;
  to: string;
  /** Chamado após sync bem-sucedida — usado para invalidar cache + reflow */
  onSynced?: () => void;
  /** Auto-sync uma vez por (from,to) ao montar */
  autoSync?: boolean;
}

export function CalendarSyncButton({ from, to, onSynced, autoSync = true }: Props) {
  const syncFn = useServerFn(syncCalendarRange);
  const [busy, setBusy] = useState(false);
  const autoKey = `${from}_${to}`;
  const autoRanRef = useRef<string | null>(null);

  const run = useCallback(
    async (silent = false) => {
      setBusy(true);
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.provider_token;
        if (!token) {
          if (!silent)
            toast.error("Sessão Google expirada", {
              description: "Saia e entre novamente para reconectar o Calendar.",
            });
          return;
        }
        const res = await syncFn({ data: { provider_token: token, from, to } });
        if (!res.ok) {
          if (!silent) toast.error("Falha na sincronização", { description: res.error });
          return;
        }
        if (!silent)
          toast.success("Calendar sincronizado", {
            description: `${res.count} evento(s) na janela`,
          });
        onSynced?.();
      } catch (err) {
        if (!silent) toast.error("Erro ao sincronizar", { description: String(err) });
      } finally {
        setBusy(false);
      }
    },
    [from, to, syncFn, onSynced],
  );

  useEffect(() => {
    if (!autoSync) return;
    if (autoRanRef.current === autoKey) return;
    autoRanRef.current = autoKey;
    run(true);
  }, [autoKey, autoSync, run]);

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => run(false)}
      disabled={busy}
      className="shrink-0 gap-1.5"
      title="Sincronizar Google Calendar"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" />
      )}
      <Calendar className="h-3.5 w-3.5" />
      <span className="hidden text-xs sm:inline">Calendar</span>
    </Button>
  );
}
