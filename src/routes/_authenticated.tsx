import { useEffect } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { useAuthReady } from "@/hooks/use-auth-ready";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AppShell,
  errorComponent: AppErrorFallback,
});

function AppErrorFallback({ error }: { error: Error }) {
  const router = useRouter();
  const message = error?.message ?? "";
  const isAuthError = /refresh token|jwt|401|unauthorized|not authenticated/i.test(message);

  async function handleRetry() {
    if (isAuthError) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* ignore */
      }
      router.navigate({ to: "/login" });
      return;
    }
    router.invalidate();
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold text-foreground">
          {isAuthError ? "Sua sessão expirou" : "Algo deu errado"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAuthError ? "Entre novamente para continuar." : message}
        </p>
        <button
          onClick={handleRetry}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {isAuthError ? "Ir para o login" : "Tentar novamente"}
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const router = useRouter();
  const { user, isReady } = useAuthReady();

  useEffect(() => {
    if (isReady && !user) router.navigate({ to: "/login" });
  }, [isReady, user, router]);

  if (!isReady || !user) {
    return <div className="h-screen bg-background" />;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader userEmail={user.email} />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
