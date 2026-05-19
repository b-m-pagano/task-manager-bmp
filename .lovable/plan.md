## Tarefas recorrentes

Adicionar repetição (diária, semanal, quinzenal, mensal, personalizada) com data de término opcional.

### Decisões-chave

- **Materialização**: na hora de salvar, geramos as N ocorrências como linhas reais em `tasks`, todas marcadas com um `series_id` comum. Vantagem: cada ocorrência aparece no calendário, pode ser arrastada, concluída e editada individualmente, sem mudar o motor de agendamento atual.
- **Limite de segurança**: até 365 ocorrências ou a data de término (o que vier primeiro). Sem data de término, exigimos no mínimo uma — default sugerido: 3 meses à frente.
- **Edição de série**: ao editar/excluir uma ocorrência, perguntamos "Apenas esta" ou "Esta e futuras" (padrão: apenas esta).

### Banco (migração)

- `tasks.series_id uuid null` + índice
- `tasks.recurrence_rule` (já existe `text`) passa a guardar JSON estruturado:
  ```json
  { "freq": "daily|weekly|biweekly|monthly|custom",
    "interval": 1, "byweekday": [1,3,5], "until": "2026-12-31", "count": null }
  ```
- `tasks.recurrence_end_date date null` (espelho de `until` para queries rápidas)

### Backend (`src/lib/tasks.functions.ts`)

- Estender `CreateTaskSchema` com bloco opcional `recurrence`.
- Novo helper `expandRecurrence(start, rule)` em `src/lib/queue/recurrence.ts` que retorna a lista de datas.
- Em `createTask`: se `recurrence` presente, gerar todas as ocorrências em uma única `insert` em lote, compartilhando `series_id = gen_random_uuid()`.
- Novas server fns:
  - `updateSeries({ series_id, from_date, patch })` — edita esta e futuras
  - `deleteSeries({ series_id, from_date })` — exclui esta e futuras

### UI (`src/components/tasks/task-dialog.tsx`)

Novo bloco "Repetição" (colapsado por padrão):

```text
[ Repetir ▾ ]  Não repetir | Diária | Semanal | Quinzenal | Mensal | Personalizada
   ├─ (se Semanal/Personalizada) dias da semana: S T Q Q S S D
   ├─ (se Personalizada) "A cada [N] [dias|semanas|meses]"
   └─ Termina em: [ date ]   (default: +3 meses)
```

Mostrado apenas em modo "criar". Em modo "editar", se a tarefa pertence a uma série, exibimos um rótulo "Parte de uma série recorrente" + botão "Editar série" que abre o diálogo de escopo (apenas esta / esta e futuras).

### Exclusão em modo edição

Ao clicar em **Excluir** numa tarefa com `series_id`, abrir o `AlertDialog` existente com três opções: Apenas esta · Esta e futuras · Cancelar.

### Fora do escopo (por ora)

- Recorrência "no último dia útil do mês" e regras RRULE complexas — só o subconjunto acima.
- Edição retroativa (alterar ocorrências já passadas).

### Perguntas antes de eu confirmar

1. Para "Personalizada", basta `a cada N dias/semanas/meses`, ou você quer também múltiplos dias da semana (ex.: seg+qua+sex)?
2. Sem data de término, o default de **3 meses à frente** está bom, ou prefere 6 meses / 1 ano?
3. Confirma que cada ocorrência deve ser uma linha real de tarefa (aparece e move-se no calendário independente), e não uma "tarefa-mãe" expandida virtualmente?