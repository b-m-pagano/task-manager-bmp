import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { ThemeProvider, themeInitScript } from "@/components/theme-provider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-semibold tracking-tight text-foreground">404</h1>
        <p className="mt-3 text-sm text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Voltar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "FocusQueue — fila inteligente de tarefas" },
      {
        name: "description",
        content:
          "Gestão de tarefas com fila universal dinâmica, calendário semanal e reagendamento automático. Pensado para foco e TDAH.",
      },
      { property: "og:title", content: "FocusQueue — fila inteligente de tarefas" },
      { name: "twitter:title", content: "FocusQueue — fila inteligente de tarefas" },
      { name: "description", content: "Meu Task Manager is a dynamic web app for intelligent task management, prioritizing users with ADHD." },
      { property: "og:description", content: "Meu Task Manager is a dynamic web app for intelligent task management, prioritizing users with ADHD." },
      { name: "twitter:description", content: "Meu Task Manager is a dynamic web app for intelligent task management, prioritizing users with ADHD." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b8cd2430-5fa2-4930-b293-3515c9013cf9/id-preview-f0bba67a--b031cc7e-4c64-461c-97b9-811fe3ab37e6.lovable.app-1779064003257.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b8cd2430-5fa2-4930-b293-3515c9013cf9/id-preview-f0bba67a--b031cc7e-4c64-461c-97b9-811fe3ab37e6.lovable.app-1779064003257.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system">
        <AuthListener />
        <Outlet />
        <Toaster position="top-right" richColors closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AuthListener() {
  const router = useRouter();
  const qc = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      router.invalidate();
      qc.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, qc]);
  return null;
}
