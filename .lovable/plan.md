## Problema

Na visão **Semana**, tarefas com horários sobrepostos são renderizadas todas com `inset-x-1` (largura cheia da coluna), uma por cima da outra, ficando "encavaladas". Além disso, blocos curtos ficam visualmente espremidos e os longos não destacam o tempo consumido, porque a escala vertical (44 px/hora) é apertada e há um `min-height` rígido em `EventCard`.

## Objetivo

- Distribuir tarefas que se sobrepõem no tempo em **colunas paralelas (lanes)** dentro da mesma coluna do dia, sem que uma cubra a outra.
- Tornar a **altura proporcional à duração** de forma mais legível (escala maior + min-height mínimo só para clicabilidade).

## Mudanças

### 1. `src/components/week-calendar/time-grid.tsx`

- Aumentar `PX_PER_HOUR` de `44` para `64` (ou `60`). Isso faz 30 min ≈ 32 px (vs. 22 px hoje) e 1 h ≈ 64 px — proporção muito mais clara entre tarefas curtas e longas. Sem mudança de lógica.

### 2. `src/components/week-calendar/event-card.tsx`

- Reduzir `min-height` de `28` para `18` px, para que blocos de 15 min sejam visivelmente menores que blocos de 30/60 min (hoje todos viram ≥ 28 px).
- Aceitar props opcionais `laneIndex` e `laneCount` e usar para posicionamento horizontal: substituir `inset-x-1` por `style={{ left: `calc(${(laneIndex/laneCount)*100}% + 2px)`, width: `calc(${100/laneCount}% - 4px)` }}` quando `laneCount > 1`.
- Manter comportamento atual quando `laneCount` ausente/1.

### 3. `src/components/week-calendar/draggable-task.tsx`

- Repassar `laneIndex` / `laneCount` recebidos via props para o `EventCard`.
- Ajustar o `DropPreview` para também usar essas faixas quando aplicável (preview alinhado à lane onde o card está sendo arrastado — opcional; aceitável manter `inset-x-1` no preview).

### 4. `src/routes/_authenticated/app.week.tsx`

- Antes do `dayTasks.map(...)`, calcular **lanes** por dia com um algoritmo simples de varredura:
  1. Ordenar tarefas por `startMinute` asc, `durationMinutes` desc.
  2. Para cada tarefa, atribuir à primeira lane cujo último `end ≤ start` atual; caso contrário, abrir nova lane.
  3. Agrupar em **clusters** de tarefas que se tocam transitivamente; dentro de cada cluster, todas recebem `laneCount = max(lane)+1` do cluster.
- Passar `laneIndex` / `laneCount` resultantes para cada `DraggableTask`.
- Aplicar a mesma lógica aos `EventCard` externos (Google Calendar) **ou** mantê-los numa lane separada à esquerda — adotar a primeira opção para simplicidade: incluir eventos externos no mesmo cálculo de lanes.

### 5. Fora de escopo

- Mudar a janela visual (continua 00–24h, work band 07–18h).
- Mudar engine de auto-schedule / reflow (continuam separando tarefas no tempo; lanes são puramente visuais para o caso em que ainda há colisão).
- Drag horizontal entre lanes.

## Critério de pronto

- Duas ou mais tarefas no mesmo horário aparecem **lado a lado** dentro da coluna do dia, sem cobrir uma a outra.
- Tarefa de 15 min é visivelmente menor que tarefa de 30 min, que é visivelmente menor que tarefa de 60 min.
- Drag & drop continua funcionando; preview de drop aparece corretamente.
