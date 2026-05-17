# Parte 1 — Fundação base (modo "preservar")

Combinado: mantemos tudo que já funciona (DnD na Semana, IA, tabelas Supabase, auth) e apenas adicionamos/extraímos o que falta para bater com o prompt original. Ao fim do projeto, reavaliamos.

## Diff resumido (o que falta vs. o que existe)

| Item do prompt | Estado | Ação |
|---|---|---|
| Dark mode com toggle | Tokens existem, falta provider + toggle | **Adicionar** |
| Sidebar (shadcn) | Sidebar caseira no `_authenticated.tsx` | **Substituir** por shadcn `Sidebar` |
| Header | Não existe | **Criar** (com `SidebarTrigger` + theme toggle + user menu) |
| Dashboard | Não existe | **Criar** página vazia em `/app` |
| Tarefas | Não existe (só Inbox) | **Criar** `/app/tasks` vazia |
| Projetos | Não existe | **Criar** `/app/projects` vazia |
| Agenda Semanal | Existe (`app.week.tsx`) | **Preservar** |
| Configurações | Existe | **Preservar** |
| TaskCard | Lógica inline em `app.week.tsx` | **Extrair** para `src/components/task-card.tsx` |
| CalendarGrid | Inline | **Extrair** para `src/components/calendar-grid.tsx` |
| FloatingActionButton | Não existe | **Criar** `src/components/fab.tsx` |
| Card / Modal / Dialog | shadcn já disponíveis | Nada a fazer |

## Etapas

### 1. Dark mode
- Criar `src/components/theme-provider.tsx` (controla classe `dark` no `<html>`, persiste em `localStorage`, respeita `prefers-color-scheme`).
- Criar `src/components/theme-toggle.tsx` (botão sol/lua usando shadcn `DropdownMenu`).
- Envolver app no `__root.tsx` com `<ThemeProvider>`.

### 2. Sidebar shadcn + Header
- Substituir a `<aside>` caseira do `_authenticated.tsx` por shadcn `Sidebar` (`collapsible="icon"`) em novo `src/components/app-sidebar.tsx`.
- Itens: Dashboard, Semana, Hoje, Inbox, Tarefas, Projetos, Categorias, Configurações.
- Criar `src/components/app-header.tsx` com `SidebarTrigger` + `ThemeToggle` + botão "Sair".
- Layout em `_authenticated.tsx`: `<SidebarProvider><AppSidebar/><div><AppHeader/><Outlet/></div></SidebarProvider>`.

### 3. Páginas vazias
Criar com placeholder mínimo (título + texto "Em construção"):
- `src/routes/_authenticated/app.index.tsx` — **transformar em Dashboard** (hoje é redirect, virar página real).
- `src/routes/_authenticated/app.tasks.tsx` — Tarefas
- `src/routes/_authenticated/app.projects.tsx` — Projetos

### 4. Componentes reutilizáveis
- `src/components/task-card.tsx` — extrai a UI do card de tarefa do `app.week.tsx` (visual + props, sem mover lógica de DnD agora).
- `src/components/calendar-grid.tsx` — extrai a grade semanal (estrutura visual; o `app.week.tsx` continua orquestrando estado/DnD).
- `src/components/fab.tsx` — botão flutuante padrão (ícone `+`, posição fixed bottom-right, variantes via `cva`).

> **Importante:** a extração é apenas estrutural — `app.week.tsx` continua funcionando igual, só passa a importar os componentes em vez de ter o JSX inline. Nada de DnD/IA é tocado.

### 5. NÃO fazer nesta etapa (conforme prompt)
- DnD, automações, reagendamento, IA, Google Calendar → preservados como estão, sem evolução.

## Detalhes técnicos

- **Stack:** mantemos TanStack Start (não vamos para Next.js — seria reescrever tudo).
- **Tokens de cor:** já em `oklch` no `src/styles.css`; vou só validar que a versão `.dark` existe e está consistente.
- **Sem migrações de DB** nesta parte.
- **Sem novas dependências** (shadcn sidebar e dropdown-menu já estão no projeto).

## Validação ao final
- Login → Dashboard carrega.
- Sidebar colapsa/expande, todas as rotas navegam.
- Toggle de tema alterna claro/escuro e persiste.
- `/app/week` continua funcionando exatamente como antes (DnD, IA, etc.).
- Build limpo.

Se aprovar, eu implemento na sequência acima.
