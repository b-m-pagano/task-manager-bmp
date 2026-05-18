## Objetivo

Permitir editar a Categoria e o Projeto a partir do diálogo que abre ao clicar em um card (em qualquer visão — Hoje, Semana, etc.), inclusive **criando** uma nova categoria/projeto na hora, com nome + cor.

## Contexto

- O componente `EntityPicker` (`src/components/tasks/entity-picker.tsx`) já existe e já implementa: busca, seleção, "Sem categoria/projeto" e mini-form de criação (nome + paleta de 8 cores). Hoje ele é usado só inline nos cards da visão Hoje.
- O `TaskDialog` (`src/components/tasks/task-dialog.tsx`), que abre ao clicar/visualizar qualquer card, ainda usa dois `<Select>` simples para Categoria e Projeto — sem opção de criar.
- Trocando esses dois Selects pelo `EntityPicker`, a funcionalidade fica disponível **em todas as visões** que abrem o card (Semana, Hoje, Inbox, Tarefas, etc.) sem duplicar código.

## Mudanças

### `src/components/tasks/task-dialog.tsx`

1. Importar `EntityPicker` e `Entity` de `@/components/tasks/entity-picker`.
2. Dentro do grid de campos (linhas ~275-313), substituir os dois blocos `<Select>` de **Categoria** e **Projeto** por dois `EntityPicker`:
   - `kind="category"` / `kind="project"`.
   - `value={categoryId === "none" ? null : categoryId}` (idem projeto).
   - `onChange={(id) => setCategoryId(id ?? "none")}` (idem projeto).
   - `options={categories}` / `options={projects}`.
   - `trigger`: um `<Button variant="outline">` (mesma altura dos demais campos do grid) mostrando bolinha de cor + nome selecionado, ou "Sem categoria"/"Sem projeto" em estado vazio.
3. Manter toda a lógica de salvar intacta (`category_id`/`project_id` já são mapeados a partir do estado existente).
4. No `onSuccess` da mutação de criação do `EntityPicker`, ele já invalida `["categories"]` / `["projects"]` e `["today"]`/`["week"]` — então o próximo render do dialog vai receber a nova opção via props (`categories`/`projects` vêm das queries já existentes em cada rota).

### Nenhuma alteração em

- `entity-picker.tsx` (já completo)
- Server functions (`categories.functions.ts`, `projects.functions.ts`)
- Schema do banco
- Demais visões — elas já passam `categories`/`projects` para o `TaskDialog`.

## Resultado

Ao abrir um card em qualquer visão, os campos Categoria e Projeto viram chips clicáveis com popover de busca + botão "Nova categoria"/"Novo projeto" (nome + cor), exatamente como já funciona inline na visão Hoje.
