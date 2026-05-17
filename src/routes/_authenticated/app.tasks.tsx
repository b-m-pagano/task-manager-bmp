import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/tasks")({
  component: TasksPage,
  head: () => ({ meta: [{ title: "Tarefas — FocusQueue" }] }),
});

function TasksPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight">Tarefas</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-foreground">Em construção</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Lista universal de tarefas, filtros e ordenação manual virão aqui.
          </p>
        </div>
      </div>
    </div>
  );
}
