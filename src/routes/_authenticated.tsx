import { useEffect } from "react";
import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { useAuthReady } from "@/hooks/use-auth-ready";

export const Route = createFileRoute("/_authenticated")({
  component: AppShell,
});

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
