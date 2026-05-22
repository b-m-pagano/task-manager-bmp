# Aba "Tarefas" — lista universal com histórico e filtros

Hoje a rota `/app/tasks` é apenas um placeholder. Vou transformá-la numa central de tarefas com histórico das concluídas, lista das pendentes e filtros combináveis.

## O que vai aparecer na tela

Cabeçalho com 3 abas:
- **A fazer** — tarefas com `status` pendente/em andamento (sem `completed_at`)
- **Concluídas** — tarefas com `completed_at` preenchido (histórico)
- **Todas** — união das duas

Logo abaixo, uma barra de filtros (todos combináveis, com chips mostrando o que está ativo e botão "Limpar"):
- **Busca** por título / descrição
- **Categoria** (multi-seleção, com as categorias do usuário)
- **Projeto** (multi-seleção, inclui opção "Sem projeto")
- **Prioridade** (baixa / média / alta)
- **Data de criação** — intervalo (de / até)
- **Data de conclusão** — intervalo (de / até) — só faz sentido nas abas Concluídas / Todas
- **Data agendada (`scheduled_day`)** — intervalo, útil para "a fazer"

Resultado renderizado como lista compacta agrupada por dia (da data relevante para a aba: agendada nas pendentes, conclusão nas concluídas). Cada linha mostra título, categoria (bolinha colorida), projeto, duração estimada e, quando concluída, data/hora de conclusão. Clicar abre o `TaskDialog` existente para editar.

Paginação simples: carrega 50 por vez com botão "Carregar mais" (Supabase tem teto de 1000 por query).

## Backend

Nova server function `listTasks` em `src/lib/tasks.functions.ts`:

```text
input: {
  scope: "todo" | "done" | "all",
  search?: string,
  categoryIds?: string[],
  projectIds?: string[],           // "none" representa sem projeto
  priorities?: ("low"|"medium"|"high")[],
  createdFrom?: string, createdTo?: string,
  completedFrom?: string, completedTo?: string,
  scheduledFrom?: string, scheduledTo?: string,
  limit?: number, offset?: number,
}
output: { tasks: Task[], total: number }
```

- Usa `requireSupabaseAuth` (RLS já protege os dados do usuário).
- Faz `select` em `tasks` com os filtros traduzidos para `.eq/.in/.gte/.lte/.is/.ilike`.
- Ordenação: pendentes por `scheduled_day asc, queue_position asc`; concluídas por `completed_at desc`.
- Reaproveita `listCategoriesProjects` (ou similar já existente) para popular os selects de filtro — se não existir um endpoint, crio um pequeno `listFilterOptions`.

Nenhuma mudança de schema. Nenhuma migração necessária — `completed_at`, `created_at`, `category_id`, `project_id` já existem.

## Frontend

- Reescrever `src/routes/_authenticated/app.tasks.tsx` com a UI descrita, usando TanStack Query (`useQuery` com `queryKey` incluindo os filtros).
- Novos componentes em `src/components/tasks/`:
  - `task-list.tsx` — lista agrupada por dia
  - `task-filters.tsx` — barra de filtros (popover de Categoria/Projeto multi-select, date range pickers, busca)
- Date range usando `Calendar` em `mode="range"` dentro de Popover (padrão shadcn já presente).
- Estado dos filtros sincronizado com a URL (search params) para que recarregar/preservar links funcione.
- Ao concluir/editar/excluir uma tarefa pela lista, invalidar `["tasks", "list"]` e os caches da semana/mês.

## Fora de escopo

- Exportação CSV do histórico
- Estatísticas/gráficos (tempo médio, taxa de conclusão)
- Edição em lote
- Filtros por tags (campo `tags[]` existe, mas hoje a UI ainda não popula consistentemente — pode entrar numa próxima iteração se quiser)

Se quiser ajustar algo (incluir tags nos filtros, mudar agrupamento, etc.), me diga; senão, sigo com essa implementação.