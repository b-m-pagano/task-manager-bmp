import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuthReady() {
  const [state, setState] = useState<{ user: User | null; isReady: boolean }>({
    user: null,
    isReady: false,
  });

  useEffect(() => {
    let cancelled = false;
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        if (error) {
          // Sessão inválida/expirada: limpa o estado local para não travar a tela.
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            /* ignore */
          }
          setState({ user: null, isReady: true });
          return;
        }
        setState({ user: data.session?.user ?? null, isReady: true });
      })
      .catch(() => {
        if (!cancelled) setState({ user: null, isReady: true });
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setState({ user: session?.user ?? null, isReady: true });
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
