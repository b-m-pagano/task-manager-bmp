import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: () => (
    <div className="p-8 text-sm text-muted-foreground">
      Configurações (buffer, horário, tema) — em breve.
    </div>
  ),
});
