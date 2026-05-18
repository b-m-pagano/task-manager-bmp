## Objetivo

Permitir, direto nos cards da visão **Hoje**, trocar a categoria e o projeto de uma tarefa — e também criar uma nova categoria ou projeto na hora, sem abrir o diálogo de edição.

## UX nos cards (visão Hoje)

Cada card ganha dois "chips" clicáveis ao lado do título:

- Chip de **categoria** (bolinha colorida + nome, ou "Categoria" se vazio)
- Chip de **projeto** (ícone + nome, ou "Projeto" se vazio)

Clicar em um chip abre um **Popover** com:

1. Campo de busca no topo
2. Opção "Sem categoria" / "Sem projeto" para limpar
3. Lista das categorias/projetos existentes (clique troca imediatamente)
4. Separador
5. Botão **"+ Nova categoria"** / **"+ Novo projeto"** que expande um mini-form inline com:
   - Input de **nome** (obrigatório, max 80)
   - Seletor de **cor** (paleta de 8 cores pré-definidas em swatches clicáveis)
   - Botões **Criar** / **Cancelar**
6. Ao criar, a nova entidade é selecionada automaticamente na tarefa

Feedback: atualização otimista no card (chip muda imediato) + spinner discreto + rollback em erro + toast.

## Trabalho técnico

```text
src/lib/projects.functions.ts            [NOVO]
  - listProjects / upsertProject / deleteProject
  - mesma forma de categories.functions.ts

src/components/tasks/category-picker.tsx [NOVO]
  - Popover com busca, lista, "+ Nova" + mini-form (nome + cor)
  - Props: value, onChange(id|null), categories, trigger
  - Internamente: useMutation(upsertCategory) + invalidate ["categories"]

src/components/tasks/project-picker.tsx  [NOVO]
  - Mesmo padrão, para projetos

src/routes/_authenticated/app.today.tsx  [EDIT]
  - Carregar categories + projects (useQuery)
  - Substituir o badge estático de categoria por <CategoryPicker>
  - Adicionar <ProjectPicker> ao lado
  - Mutação updateTask otimista para troca (já existe pattern de toggle)
```

## Detalhes

- **Paleta de cores fixa** para criação rápida: 8 swatches (indigo, emerald, amber, rose, sky, violet, orange, slate) — cobre os casos comuns sem color picker complexo.
- Os pickers só aparecem na visão **Hoje** nesta entrega. Semana e Inbox seguem como estão.
- Reuso: o componente `CategoryPicker`/`ProjectPicker` é desenhado para ser reaproveitado depois em Semana/Inbox se você quiser estender.
- O TaskDialog continua funcionando normalmente (categoria/projeto pelos Selects existentes).
- Sem mudanças de schema: tabelas `categories` e `projects` já existem com RLS por usuário.

## Fora de escopo

- Editar/excluir categoria ou projeto a partir do card (continua em telas dedicadas)
- Reordenação de categorias/projetos
- Aplicar o picker em Semana e Inbox
