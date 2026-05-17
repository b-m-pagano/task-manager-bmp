import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/projects")({
  component: ProjectsPage,
  head: () => ({ meta: [{ title: "Projetos — FocusQueue" }] }),
});

function ProjectsPage() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <h1 className="text-base font-semibold tracking-tight">Projetos</h1>
      </header>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-semibold text-foreground">Em construção</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Agrupamento de tarefas por projeto, com status e prazos.
          </p>
        </div>
      </div>
    </div>
  );
}
