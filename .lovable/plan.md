
# FocusQueue — MVP

Sistema web de gestão de tarefas com **fila universal dinâmica**, calendário semanal e reagendamento automático, focado em usuários com TDAH.

## 1. Stack

- TanStack Start + React 19 + TypeScript + Tailwind v4 (stack atual do projeto — Next.js não se aplica aqui)
- Lovable Cloud (Supabase) para banco, auth e RLS
- Google OAuth via Lovable Cloud (login único, libera escopo de Calendar)
- Google Calendar API (somente leitura) — `calendar.readonly`
- Lovable AI Gateway (`google/gemini-3-flash-preview`) para Quick Add em linguagem natural
- `@dnd-kit/core` para drag-and-drop e resize dos cards

## 2. Arquitetura

```text
src/
  routes/
    __root.tsx                  Providers + listener auth
    index.tsx                   Landing pública
    login.tsx                   Google Sign-in
    _authenticated.tsx          Guarda de sessão
    _authenticated/
      app.tsx                   Layout app (sidebar + topbar)
      app/index.tsx             Redireciona p/ /app/week
      app/week.tsx              ★ Calendário semanal (tela principal)
      app/today.tsx             Visão "agora + próximas"
      app/inbox.tsx             Tarefas sem horário / backlog
      app/categories.tsx        Tipos de tarefa
      app/settings.tsx          Buffer, horários, Google Calendar
    api/
      quick-add.ts              POST → IA parseia texto livre
      google/callback.ts        OAuth callback (caso necessário)
      google/sync.ts            POST → puxa eventos da semana
  lib/
    queue/
      scheduler.ts              Motor de reagendamento (puro, testável)
      buffer.ts                 Lógica de buffer entre tarefas
      conflicts.ts              Detecção de colisão tarefa×evento
    tasks.functions.ts          CRUD tarefas (createServerFn)
    categories.functions.ts     CRUD tipos
    calendar.functions.ts       Sync + leitura de eventos
    quick-add.functions.ts      Wrapper IA
    ai-gateway.ts               Provider Lovable AI
  components/
    calendar/
      WeekGrid.tsx              Grade 7 dias × horas
      DayColumn.tsx
      TimeAxis.tsx
      NowIndicator.tsx          Linha do "agora"
      TaskCard.tsx              Card draggable + resizable
      EventCard.tsx             Evento Google (read-only, prioridade)
      AfterHoursBadge.tsx       Alerta pós-18h
    quick-add/QuickAddBar.tsx
    tasks/{TaskDialog,SubtaskList,PriorityPicker,CategoryChip}.tsx
    focus/NextTaskBanner.tsx    "Agora" em destaque (TDAH)
    layout/{Sidebar,Topbar}.tsx
```

**Princípio**: o `scheduler` é puro (sem I/O). Recebe `(tarefas, eventos, config)` e retorna `(tarefas com horários calculados)`. Isso permite recalcular no cliente para feedback instantâneo no drag, e revalidar no servidor antes de persistir.

## 3. Schema do banco

```sql
-- Tipos/categorias personalizadas por usuário
create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null,           -- hex
  icon text,                     -- nome lucide
  created_at timestamptz default now()
);

-- Conexões Google (tokens OAuth p/ Calendar)
create table google_connections (
  user_id uuid primary key references auth.users on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  calendar_ids text[] default '{primary}',
  updated_at timestamptz default now()
);

-- Eventos importados (cache; readonly)
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  google_event_id text not null,
  calendar_id text not null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean default false,
  synced_at timestamptz default now(),
  unique (user_id, google_event_id)
);

-- Tarefas (núcleo)
create type task_status as enum ('pending','in_progress','done','skipped');
create type task_priority as enum ('low','medium','high','urgent');

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  parent_id uuid references tasks on delete cascade,
  category_id uuid references categories on delete set null,
  title text not null,
  description text,
  estimated_minutes int not null default 30,
  priority task_priority not null default 'medium',
  status task_status not null default 'pending',
  due_date date,                         -- data limite
  scheduled_day date,                    -- dia alvo da fila
  queue_position int not null default 0, -- ordem dentro do dia
  scheduled_start timestamptz,           -- calculado pelo scheduler
  scheduled_end timestamptz,             -- calculado
  actual_start timestamptz,
  actual_end timestamptz,
  pinned_at timestamptz,                 -- usuário travou no horário
  tags text[] default '{}',
  quick_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index tasks_user_day_idx on tasks(user_id, scheduled_day, queue_position);

-- Config por usuário
create table user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  day_start_minute int default 480,      -- 08:00
  after_hours_minute int default 1080,   -- 18:00
  buffer_minutes int default 5,
  carry_unfinished boolean default true,
  theme text default 'system'
);
```

RLS: em todas as tabelas, `user_id = auth.uid()`.

## 4. Motor de reagendamento (`scheduler.ts`)

Algoritmo determinístico por dia:

1. Carrega `eventos` do dia ordenados por `starts_at`.
2. Carrega `tarefas` do dia ordenadas por `queue_position`.
3. Cursor começa em `day_start` (08:00). Para cada tarefa em ordem:
   - Calcula janela `[cursor, cursor + estimated + buffer]`.
   - Se colidir com algum evento → empurra cursor para `event.ends_at + buffer` e tenta de novo.
   - Tarefas com `pinned_at` definem âncora: o cursor salta para ela e tarefas anteriores são empacotadas no espaço livre anterior (se couberem) ou empurradas adiante.
   - Marca `scheduled_start/end`.
4. Se `scheduled_end > after_hours_minute` → flag `afterHours` no card.

**Drag**: ao soltar, atualiza `queue_position` (e opcionalmente `pinned_at` se soltar em horário específico) e recalcula. Resize → ajusta `estimated_minutes` e recalcula.

**Migração de não-concluídas**: job leve disparado no primeiro acesso do dia — tarefas `pending` com `scheduled_day < hoje` são movidas para hoje na frente da fila (preservando ordem entre si).

## 5. Integração Google Calendar (somente leitura)

- Login com Google via Lovable Cloud já retorna `provider_token`/`provider_refresh_token` quando o escopo `https://www.googleapis.com/auth/calendar.readonly` é solicitado.
- `calendar.functions.ts → syncWeek()`: chama `GET /calendar/v3/calendars/{id}/events?timeMin&timeMax`, faz upsert em `calendar_events`.
- Sync acionado: ao abrir `/app/week`, ao trocar de semana, e a cada 5 min via `setInterval` quando aba ativa.
- Eventos renderizam como `EventCard` (cinza, não-interativos) e participam do scheduler como bloqueios imutáveis.

## 6. Quick Add com IA

`api/quick-add.ts` recebe `{ text: "Revisar contrato com João amanhã 2h" }` e usa AI SDK com `Output.object` (Zod):

```ts
{ title, estimatedMinutes, scheduledDay, priority, categoryHint, dueDate }
```

Server fn cria a tarefa no final da fila do dia inferido e recalcula. Resposta otimista no cliente.

## 7. Tela principal — `/app/week`

```text
┌───────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar: QuickAdd ──────────── semana ◀ hoje ▶  │
│ Hoje    ├───────────────────────────────────────────────── │
│ Semana  │ Banner "Agora": [Card da tarefa atual + timer]  │
│ Inbox   ├───────────────────────────────────────────────── │
│ Tipos   │   Seg  Ter  Qua  Qui  Sex  Sáb  Dom              │
│ Config  │ 8 ┌──┐                                           │
│         │ 9 │T1│ ┌────┐                                    │
│         │10 └──┘ │Evt │  ← Google (prioridade, cinza)      │
│         │11 ┌──┐ └────┘                                    │
│         │12 │T2│                                           │
│         │.. └──┘    ... 18h marca linha de alerta          │
└───────────────────────────────────────────────────────────┘
```

Características visuais (foco TDAH):
- Paleta clara, baixo contraste para fundo, alto apenas no "agora".
- Linha horizontal sutil indicando hora atual.
- Linha tracejada às 18h; cards após esse horário recebem badge âmbar.
- Animações `transition-all duration-200 ease-out`, sem bounce.
- Dark mode nativo via tokens em `styles.css`.

## 8. Fluxo de funcionamento

1. Usuário faz login com Google → cria `user_settings` + categorias default.
2. Concede escopo de Calendar → sync inicial puxa semana atual.
3. Tela `/app/week` carrega tarefas + eventos + roda scheduler client-side.
4. Quick Add ou botão "+" cria tarefa → server fn persiste → revalida query.
5. Drag/resize → atualização otimista no cliente (scheduler local) → server fn persiste novo `queue_position`/`estimated` → re-roda scheduler servidor e devolve estado canônico.
6. À meia-noite (ou primeiro acesso do dia), `carryUnfinished()` migra pendências.

## 9. Escopo do MVP (entregável agora)

Incluído:
- Auth Google + guarda de rotas
- Schema completo com RLS
- CRUD de tarefas e categorias (server fns)
- Sync Google Calendar (read-only)
- Scheduler funcional + buffer + alerta 18h + carry-over
- WeekGrid com drag/resize/quick-edit
- QuickAdd com IA
- Banner "agora" e visão Today
- Dark mode + design minimalista

Fora do MVP (arquitetura preparada, sem UI):
- Escrita no Google Calendar
- WhatsApp/email/voice
- Dashboards e gamificação
- Notificações push

## 10. Ordem de implementação

1. Habilitar Lovable Cloud + migration do schema
2. Auth Google + rotas protegidas + sidebar/layout
3. Server fns de categorias e tarefas + seeds default
4. Scheduler puro + testes manuais
5. WeekGrid + TaskCard + EventCard (sem DnD)
6. Drag-and-drop e resize
7. Quick Add com IA
8. Sync Google Calendar
9. Carry-over de não concluídas + alerta after-hours
10. Polimento visual, dark mode, NextTaskBanner

Quando aprovar, começo pela etapa 1.
