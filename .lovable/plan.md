## Diagnóstico

Hoje o calendário do mês vive como um painel fixo de **248px** à esquerda da visão Semana (`app.week.tsx`, aside com `MiniCalendar` + lista de categorias). Ele rouba cerca de **23% da largura útil** em telas como a sua (1078px), comprimindo a grade semanal — que é a visão principal do produto.

## Recomendação

Seguir exatamente a sua intuição, com um pequeno reforço:

1. **Criar uma rota `Mês` (`/app/month`)** na sidebar, posicionada **acima de "Semana"** no grupo Principal. Ao clicar, abre uma visão de mês inteira, em tela cheia, com bom espaço para respirar e clicar em qualquer dia para "saltar" para a semana correspondente.
2. **Remover o aside fixo da Semana** (mini-calendário + lista de categorias). A semana passa a ocupar 100% da largura — ganho imediato de respiro visual.
3. **Adicionar um seletor de data discreto no header da Semana**: um botão `[ícone calendário] 18–24 nov` que abre um popover com o mini-calendário sob demanda. Quem precisa pular para outra semana ainda consegue em 2 cliques, sem ocupar espaço permanente.
4. **Mover a legenda de categorias** para um popover compacto no mesmo header (ícone de etiqueta), já que ela também era ruído permanente na lateral.

Isso preserva 100% da funcionalidade atual, devolve espaço à visão principal e torna o mês um destino intencional — não um chrome sempre-presente.

## Mudanças por arquivo

- `src/components/app-sidebar.tsx`
  - Adicionar item `{ title: "Mês", url: "/app/month", icon: CalendarRange }` **antes** de `Semana` em `mainItems`.

- `src/routes/_authenticated/app.month.tsx` (novo)
  - Grade 7×N com o mês inteiro, indicadores leves (ponto colorido por categoria) para dias com tarefas/eventos.
  - Clicar em um dia → navega para `/app/week` com aquela data selecionada (via search param `?day=YYYY-MM-DD`).
  - Navegação ‹ Mês › no header, botão "Hoje".

- `src/routes/_authenticated/app.week.tsx`
  - Remover o `<aside>` lateral (linhas ~463–490).
  - No header, adicionar dois `Popover`s: `DatePickerPopover` (envolvendo o `MiniCalendar` existente, reaproveitado) e `CategoryLegendPopover`.
  - Aceitar `?day=` no search da rota para pré-selecionar a semana quando vier do Mês.

- `src/components/week-calendar/mini-calendar.tsx` — sem mudanças, reaproveitado dentro do popover.

## Detalhes técnicos

- A rota `/app/month` usa `listWeekData` por semana ou um novo `listMonthData` server fn enxuto (apenas `scheduled_day` + `category_id` dos pendentes do mês) para os indicadores — token-eficiente, sem trazer o payload completo da semana.
- O `?day=` na Semana é opcional; quando ausente, mantém o comportamento atual (semana corrente).
- Nada muda na lógica de agendamento, drag-and-drop, IA ou Focus Mode — é só rearrumação de chrome.

## Fora de escopo

- Redesign de cores/tipografia.
- Drag-and-drop entre dias na visão Mês (pode vir depois, se você quiser).
- Mudanças no Focus, IA ou engine de fila.
