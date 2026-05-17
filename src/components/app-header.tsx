import { LogOut } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabase } from "@/integrations/supabase/client";

export function AppHeader({ userEmail }: { userEmail?: string | null }) {
  const router = useRouter();
  async function signOut() {
    await supabase.auth.signOut();
    router.navigate({ to: "/login" });
  }
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/60 px-3 backdrop-blur">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-5" />
      <div className="ml-auto flex items-center gap-1">
        {userEmail && (
          <span className="hidden text-xs text-muted-foreground sm:inline">{userEmail}</span>
        )}
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
