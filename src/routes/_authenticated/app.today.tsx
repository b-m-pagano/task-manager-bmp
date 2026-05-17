import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/today")({
  component: () => (
    <div className="p-8 text-sm text-muted-foreground">
      Visão "Hoje" em breve. Use a aba Semana.
    </div>
  ),
});
