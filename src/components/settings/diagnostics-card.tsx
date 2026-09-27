import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Loader2, Play, RefreshCw, Stethoscope, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { getDiagnostics, testGoogleConnection } from "@/lib/diagnostics.functions";

type Status = "ok" | "warn" | "error";

interface Row {
  label: string;
  status: Status;
  detail: string;
  fix?: string;
  onTest?: () => void;
  testing?: boolean;
}

function StatusIcon({ s }: { s: Status }) {
  if (s === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />;
  if (s === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
}

export function DiagnosticsCard() {
  const diagFn = useServerFn(getDiagnostics);
  const testGoogleFn = useServerFn(testGoogleConnection);

  const q = useQuery({
    queryKey: ["diagnostics"],
    retry: false,
    queryFn: async () => {
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      let server: Awaited<ReturnType<typeof diagFn>> | null = null;
      let serverErr: string | null = null;
      try {
        server = await diagFn();
      } catch (e) {
        serverErr = e instanceof Error ? e.message : String(e);
      }
      return { auth: auth?.user ?? null, authErr: authErr?.message ?? null, server, serverErr };
    },
  });

  const retest = () => q.refetch();

  const googleTest = useMutation({
    mutationFn: () => testGoogleFn(),
    onSuccess: (r) => {
      if (r.ok) toast.success("Google Calendar OK", { description: r.detail });
      else toast.error(`Falha na etapa: ${r.step}`, { description: r.detail });
      q.refetch();
    },
    onError: (e) => toast.error("Teste do Google falhou", { description: String(e) }),
  });

  const rows: Row[] = [];
  if (q.data) {
    const { auth, authErr, server, serverErr } = q.data;

    // Auth
    if (auth) {
      rows.push({
        label: "Autenticação",
        status: "ok",
        detail: `Conectado como ${auth.email}`,
        onTest: retest,
        testing: q.isFetching,
      });
    } else {
      rows.push({
        label: "Autenticação",
        status: "error",
        detail: authErr ?? "Nenhuma sessão ativa.",
        fix: "Sua sessão expirou. Saia (ícone no canto superior direito) e entre novamente.",
        onTest: retest,
        testing: q.isFetching,
      });
    }

    // Backend
    if (!server) {
      rows.push({
        label: "Servidor e banco de dados",
        status: "error",
        detail: serverErr ?? "Sem resposta do servidor.",
        fix: /unauthorized|401/i.test(serverErr ?? "")
          ? "O servidor recusou sua sessão. Faça login novamente."
          : /environment|SUPABASE/i.test(serverErr ?? "")
            ? "As credenciais do backend não estão disponíveis. Recarregue a página em 1 minuto; se persistir, peça ao assistente para religar o Lovable Cloud."
            : "Verifique sua internet e clique em “Verificar novamente”. Se persistir, peça ajuda ao assistente.",
        onTest: retest,
        testing: q.isFetching,
      });
    } else {
      const b = server.backend;
      rows.push(
        b.envOk && b.dbOk
          ? {
              label: "Servidor e banco de dados",
              status: b.dbLatencyMs > 1500 ? "warn" : "ok",
              detail: `Respondendo em ${b.dbLatencyMs} ms`,
              fix: b.dbLatencyMs > 1500 ? "Resposta lenta. Pode ser instabilidade temporária." : undefined,
              onTest: retest,
              testing: q.isFetching,
            }
          : {
              label: "Servidor e banco de dados",
              status: "error",
              detail: b.dbError ?? "Configuração do backend incompleta.",
              fix: "Recarregue a página. Se continuar, peça ao assistente para verificar o Lovable Cloud.",
              onTest: retest,
              testing: q.isFetching,
            },
      );

      // Google
      const g = server.google;
      if (!g.credentialsOk) {
        rows.push({
          label: "Credenciais do Google",
          status: "error",
          detail: "Client ID ou Client Secret do Google ausentes no servidor.",
          fix: "Peça ao assistente para cadastrar GOOGLE_OAUTH_CLIENT_ID e GOOGLE_OAUTH_CLIENT_SECRET (copiados do Google Cloud Console → Credenciais).",
          onTest: retest,
          testing: q.isFetching,
        });
      } else {
        rows.push({
          label: "Credenciais do Google",
          status: "ok",
          detail: "Configuradas",
          onTest: retest,
          testing: q.isFetching,
        });
      }

      const googleRowBase = {
        onTest: () => googleTest.mutate(),
        testing: googleTest.isPending,
      };
      if (g.queryError) {
        rows.push({
          label: "Google Calendar",
          status: "error",
          detail: g.queryError,
          fix: "Não foi possível ler a conexão. Tente novamente em instantes.",
          ...googleRowBase,
        });
      } else if (!g.connected) {
        rows.push({
          label: "Google Calendar",
          status: "warn",
          detail: "Nenhuma conta conectada.",
          fix: "Clique em “Conectar Google Calendar” no cartão acima e autorize o acesso ao calendário.",
          ...googleRowBase,
        });
      } else {
        const last = g.lastSyncAt ? new Date(g.lastSyncAt) : null;
        const stale = !last || Date.now() - last.getTime() > 24 * 3600 * 1000;
        rows.push({
          label: "Google Calendar",
          status: stale ? "warn" : "ok",
          detail: last
            ? `Conectado · última sincronização ${last.toLocaleString("pt-BR")}`
            : "Conectado · ainda não sincronizado",
          fix: stale
            ? "Abra a Semana e clique no botão “Calendar” para sincronizar. Se falhar, use “Reconectar” acima."
            : undefined,
          ...googleRowBase,
        });
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Stethoscope className="h-4 w-4" /> Diagnóstico
          </CardTitle>
          <CardDescription>Status das conexões do app, com o que fazer se algo falhar.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
          {q.isFetching ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Verificar novamente
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando…
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.label} className="flex gap-3 py-2.5">
                <StatusIcon s={r.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{r.label}</p>
                  <p className="break-words text-xs text-muted-foreground">{r.detail}</p>
                  {r.fix && (
                    <p className="mt-1 rounded-md bg-muted px-2 py-1.5 text-xs text-foreground">
                      {r.fix}
                    </p>
                  )}
                </div>
                {r.onTest && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={r.onTest}
                    disabled={r.testing}
                    title={`Testar novamente: ${r.label}`}
                  >
                    {r.testing ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="mr-1 h-3 w-3" />
                    )}
                    Testar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {q.data?.server && (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Última verificação: {new Date(q.data.server.checkedAt).toLocaleTimeString("pt-BR")} ·{" "}
            <Link to="/app/week" className="underline">
              ir para a Semana
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
