# Bug de fuso horário ao agendar horário de início

## Diagnóstico

Em `src/lib/tasks.functions.ts`, a função `startTsFromMinute` monta a timestamp assim:

```ts
return `${day}T${h}:${m}:00`;   // ex: "2026-05-18T08:00:00"
```

A string **não tem offset de timezone**. A coluna `scheduled_start` é `timestamptz`, então o Postgres interpreta valores sem offset como **UTC**. Você está em **BRT (UTC-3)**, então:

- Você cria às `08:00` → grava `2026-05-18T08:00:00Z` (UTC)
- A interface lê de volta e converte para o fuso local → exibe `05:00` BRT

Daí a diferença de 3 horas que você viu.

O mesmo bug afeta: criação de tarefas, edição de horário, agendar-da-Inbox e reordenação em lote (`moveTasksToDay`).

## Correção

A timezone do usuário só é confiável no **cliente** (`Intl.DateTimeFormat().resolvedOptions().timeZone` / `getTimezoneOffset()`). O servidor TanStack roda em UTC. Vou enviar o offset do cliente junto com o payload.

### 1. Helper compartilhado

Criar `src/lib/timezone.ts` com:

- `getLocalTzOffsetMinutes()` — retorna o offset atual do navegador (ex: `180` para BRT).
- `formatOffset(min)` — converte para o sufixo ISO (`"-03:00"`).

### 2. Servidor (`src/lib/tasks.functions.ts`)

- Adicionar `tz_offset_minutes: z.number().int().min(-840).max(840).optional()` aos schemas: `CreateTaskSchema`, `UpdateTaskSchema`, `MoveTasksToDaySchema`, `ScheduleFromInboxSchema`.
- Alterar `startTsFromMinute(day, minute, tzOffsetMinutes?)` para anexar o sufixo de offset quando fornecido. Sem offset, manter o comportamento atual (compatibilidade).
- Propagar `tz_offset_minutes` em todos os locais que chamam `startTsFromMinute` dentro do arquivo.

### 3. Cliente — passar o offset em todas as chamadas

Em cada call site, ler `getLocalTzOffsetMinutes()` e incluir no `data`:

- `src/components/tasks/quick-add-bar.tsx` (createTask)
- `src/components/tasks/task-dialog.tsx` (createTask + updateTask)
- `src/components/tasks/subtask-list.tsx` (createTask)
- `src/routes/_authenticated/app.inbox.tsx` (createTask, scheduleFromInbox)
- `src/routes/_authenticated/app.focus.tsx` (updateTask)
- `src/routes/_authenticated/app.week.tsx` e componentes de drag-and-drop que chamam `updateTask` / `moveTasksToDay` (a verificar nos handlers de drop).

### 4. Sem migração de dados

Tarefas já gravadas com offset errado **não** serão re-corrigidas automaticamente (o servidor não sabe em qual fuso foram criadas). Se quiser, posso adicionar uma migração one-shot que assume BRT para tarefas existentes — me avise.

## Escopo

Apenas correção do bug de fuso. Sem mudanças visuais, sem alterar a UX de agendamento.

