import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Loader2, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  disconnectGoogle,
  getGoogleAuthUrl,
  getGoogleConnectionStatus,
} from "@/lib/google/connection.functions";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: SettingsPage,
  validateSearch: (s: Record<string, unknown>) => ({
    google: typeof s.google === "string" ? (s.google as string) : undefined,
  }),
});

function SettingsPage() {
  const search = Route.useSearch();
  useEffect(() => {
    if (search.google === "connected") toast.success("Google Calendar conectado!");
    else if (search.google === "denied") toast.message("Conexão cancelada.");
    else if (search.google === "error") toast.error("Não foi possível conectar.");
  }, [search.google]);

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          <p className="mt-1 text-sm text-muted-foreground">Preferências da conta e integrações.</p>
        </header>
        <GoogleCalendarCard />
      </div>
    </div>
  );
}

function GoogleCalendarCard() {
  const getStatus = useServerFn(getGoogleConnectionStatus);
  const getUrl = useServerFn(getGoogleAuthUrl);
  const disconnect = useServerFn(disconnectGoogle);
  const [acting, setActing] = useState<"connect" | "disconnect" | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["google-connection-status"],
    queryFn: () => getStatus(),
  });

  async function onConnect() {
    setActing("connect");
    try {
      const { url } = await getUrl();
      window.location.href = url;
    } catch (e) {
      toast.error("Falha ao iniciar conexão", { description: String(e) });
      setActing(null);
    }
  }
  async function onDisconnect() {
    setActing("disconnect");
    try {
      await disconnect();
      toast.success("Google Calendar desconectado");
      refetch();
    } catch (e) {
      toast.error("Falha ao desconectar", { description: String(e) });
    } finally {
      setActing(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4" /> Google Calendar
        </CardTitle>
        <CardDescription>
          Conecte para sincronizar eventos e evitar conflitos com sua fila.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando…
          </div>
        ) : data?.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span>Conectado</span>
              {data.lastSyncAt && (
                <span className="text-muted-foreground">
                  · última sync {new Date(data.lastSyncAt).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onDisconnect}
                disabled={acting === "disconnect"}
              >
                <XCircle className="mr-1.5 h-3.5 w-3.5" />
                {acting === "disconnect" ? "Desconectando…" : "Desconectar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={onConnect} disabled={acting === "connect"}>
                Reconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada.</p>
            <Button onClick={onConnect} disabled={acting === "connect"}>
              {acting === "connect" ? "Abrindo Google…" : "Conectar Google Calendar"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
