import { createFileRoute, redirect, Outlet, Link, useRouter } from "@tanstack/react-router";
import { Calendar, LayoutGrid, Inbox, Tags, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AppShell,
});

function AppShell() {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  }
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card/30 px-3 py-5 md:flex">
        <Link to="/app/week" className="mb-6 flex items-center gap-2 px-2">
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="text-sm font-semibold tracking-tight">FocusQueue</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 text-sm">
          <NavItem to="/app/week" icon={Calendar} label="Semana" />
          <NavItem to="/app/today" icon={LayoutGrid} label="Hoje" />
          <NavItem to="/app/inbox" icon={Inbox} label="Inbox" />
          <NavItem to="/app/categories" icon={Tags} label="Categorias" />
          <NavItem to="/app/settings" icon={Settings} label="Configurações" />
        </nav>
        <button
          onClick={signOut}
          className="mt-auto flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
      activeProps={{ className: "bg-accent text-foreground" }}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
