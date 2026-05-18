## Objetivo

Hoje, ao clicar num card na visão Hoje, abre o `TaskDialog` (`src/components/tasks/task-dialog.tsx`). Em telas comuns (≈638px de altura como a sua viewport atual), o conteúdo ultrapassa os `max-h-[90vh]` do `DialogContent` e aparece com rolagem interna — campos como Notas e botões do rodapé só aparecem quando o usuário rola.

A meta é fazer o card (modal) caber inteiro na janela na maioria das alturas de tela, sem alterar nenhuma funcionalidade.

## Mudanças (apenas visual / layout, em `src/components/tasks/task-dialog.tsx`)

1. **Aumentar o aproveitamento horizontal**
   - Trocar `sm:max-w-[560px]` por `sm:max-w-[720px]` para acomodar mais campos por linha.
   - Reduzir `p-6` do `DialogContent` para `p-5` (override via className).

2. **Compactar espaçamentos verticais**
   - `grid gap-4 py-2` → `grid gap-3 py-1`.
   - Cada `grid gap-1.5` de campo → `grid gap-1`.
   - `Textarea` de Descrição: `rows={2}` → `rows={2}` mantém, mas com `resize-none`.
   - `Textarea` de Notas: `rows={3}` → `rows={2}` com `resize-none`.

3. **Reorganizar em colunas para encurtar a altura**
   - Mover Categoria, Projeto, Duração, Prioridade, Status para uma única grid `grid-cols-2 md:grid-cols-3 gap-3` (em vez de duas grids separadas de 2 e 3 colunas).
   - Manter Dia / Horário / Prazo na grid de 3 colunas que já existe.

4. **Rodapé mais enxuto**
   - Botões secundários (Excluir, Duplicar, Mover para Inbox) ficam em `size="sm"` (já são) e o `DialogFooter` ganha `pt-2` em vez do espaçamento padrão maior.

5. **Garantir fallback em telas muito baixas**
   - Manter `max-h-[90vh] overflow-y-auto` como segurança: em monitores realmente curtos a rolagem ainda existe, mas para a viewport atual (~638px) e maiores o modal cabe inteiro.

## Fora do escopo

- Não mexer em nenhum comportamento, validação, mutations, atalhos de teclado, ou na lógica do `SubtaskList`.
- Não alterar o `TaskCard`, a visão Hoje, nem o `EntityPicker`.
- Não trocar o componente `Dialog` base nem o sistema de tokens.

## Verificação

Após implementar: abrir um card na visão Hoje na viewport atual (1078×638) e confirmar que título, descrição, categoria/projeto/duração/prioridade/status, dia/horário/prazo, subtarefas (se houver poucas), notas e rodapé aparecem sem scroll interno.
