import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  component: () => (
    <div className="p-8 text-sm text-muted-foreground">
      Inbox de tarefas sem agendamento — em breve.
    </div>
  ),
});
