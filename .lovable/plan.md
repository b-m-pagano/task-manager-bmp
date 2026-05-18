## Objetivo

Transformar a Inbox (hoje placeholder) numa caixa de entrada real, no estilo GTD: capturar tarefas sem precisar decidir quando fazê-las, e depois movê-las para um dia da semana com facilidade.

## Como vai funcionar (visão do usuário)

1. **Capturar rápido**
   - Botão "Adicionar à Inbox" na própria página `/app/inbox`.
   - Atalho `i` em qualquer tela abre um campo de captura rápida e cai direto na Inbox.
   - O Quick Add do topo ganha um sufixo `#inbox` opcional ("Ligar pro contador #inbox") que manda a tarefa pra Inbox em vez de hoje.

2. **Triar (página /app/inbox)**
   - Lista vertical das tarefas sem data, ordenadas por prioridade depois por data de criação.
   - Cada item mostra: título, prioridade, categoria, estimativa, notas.
   - Ações por linha:
     - **Agendar** → popover com mini-calendário; escolher o dia move pra agenda (vira tarefa normal).
     - **Hoje / Amanhã / Próxima semana** → atalhos rápidos.
     - **Editar** → abre o TaskDialog atual.
     - **Concluir** / **Excluir**.
   - Contador da Inbox aparece na sidebar (badge ao lado de "Inbox").

3. **Mover de volta pra Inbox**
   - No TaskDialog, opção "Mover para Inbox" — remove a data e devolve à fila.

## Decisões técnicas

- **Modelo**: adicionar coluna `is_inbox boolean NOT NULL DEFAULT false` em `public.tasks`. `scheduled_day` continua sendo preenchido (com a data de criação) para não quebrar nenhuma query/agendador existente; o que define "está na Inbox" é a flag. Índice parcial para listagem rápida (`WHERE is_inbox = true`).
- **Server fns novas** em `src/lib/tasks.functions.ts`:
  - `listInbox()` — retorna tarefas com `is_inbox = true`, ordenadas.
  - `sendToInbox({ id })` — seta `is_inbox = true`, limpa `scheduled_start`.
  - `scheduleFromInbox({ id, scheduled_day, start_minute? })` — seta `is_inbox = false`, define dia e (opcional) horário, recoloca no fim da fila do dia.
  - `createTask` ganha opção `inbox?: boolean`; quando true, ignora `scheduled_day` recebido e marca a flag.
- **Página `/app/inbox`** (substitui o placeholder atual):
  - Header com título, contador e botão "Nova na Inbox".
  - Lista com cards usando o mesmo visual de `task-card`.
  - Popover de "Agendar" usando o `MiniCalendar` que já existe.
- **Sidebar**: badge numérico ao lado de "Inbox" usando `useQuery` em `listInbox()` com `select: r => r.length`.
- **Quick Add**: parser detecta sufixo `#inbox` e seta a flag.
- **Atalho `i`**: adicionado no listener global de teclas (mesmo lugar do `n` e `/`).

## Fora de escopo (para uma próxima rodada)

- Drag-and-drop da Inbox direto pro grid da semana — começamos com o popover de agendar; se você quiser, dá pra evoluir depois.
- Migração das tarefas existentes pra Inbox automaticamente (nenhuma migra; só novas entram).
- Recorrência / lembretes na Inbox.

## Entregáveis

1. Migration SQL adicionando `is_inbox` + índice parcial.
2. Server functions: `listInbox`, `sendToInbox`, `scheduleFromInbox`, e atualização de `createTask`.
3. Página `/app/inbox` funcional.
4. Badge na sidebar.
5. Suporte a `#inbox` no Quick Add e atalho `i`.

Posso seguir?