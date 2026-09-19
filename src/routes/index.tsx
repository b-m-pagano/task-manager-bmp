import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Calendar, Sparkles, Waypoints } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
  head: () => ({
    meta: [
      { title: "FocusQueue — fila inteligente para mentes ocupadas" },
      {
        name: "description",
        content:
          "Uma fila universal de tarefas que se reorganiza sozinha em volta da sua agenda do Google Calendar.",
      },
    ],
  }),
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-primary" />
          <span className="text-sm font-semibold tracking-tight">FocusQueue</span>
        </div>
        <Link
          to="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-16 pb-24 text-center sm:pt-24">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3" /> Feito para foco
        </span>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
          A sua fila de tarefas, <br />
          reorganizada sozinha.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Compromissos do Google Calendar têm prioridade absoluta. Suas tarefas se encaixam nos
          espaços livres e se reordenam automaticamente quando algo muda. Você só decide o que vem
          agora.
        </p>

        <Link
          to="/login"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Entrar com Google <ArrowRight className="h-4 w-4" />
        </Link>

        <div className="mt-20 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Calendar,
              title: "Calendário semanal",
              text: "Visualize a semana com tarefas e eventos no mesmo lugar.",
            },
            {
              icon: Waypoints,
              title: "Fila contínua",
              text: "Atrasou? Tudo se realinha. Sem repensar a agenda toda hora.",
            },
            {
              icon: Sparkles,
              title: "Quick Add com IA",
              text: '"Revisar contrato amanhã 2h" vira tarefa pronta.',
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-border bg-card p-5 text-left">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
