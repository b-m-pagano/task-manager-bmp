# Meu Task Manager

Quero construir um sistema web moderno de gestão inteligente de tarefas, com foco em usuários com TDAH e dificuldades de organização.

O conceito principal do sistema é o de uma FILA UNIVERSAL DE TAREFAS DINÂMICA.

O sistema deve funcionar como uma combinação entre:

- calendário semanal;

- gerenciador de tarefas;

- e organizador automático de agenda.

# OBJETIVO PRINCIPAL

O sistema deve remover do usuário a necessidade de reorganizar manualmente suas tarefas ao longo do dia.

Compromissos do calendário têm prioridade absoluta.

As tarefas devem se reorganizar automaticamente com base:

- em horários disponíveis;

- em novas reuniões;

- em atrasos;

- em remanejamentos manuais;

- e em tarefas não concluídas.

# VISÃO PRINCIPAL DO SISTEMA

A tela principal deve ser uma visualização semanal semelhante ao Google Calendar.

Cada dia:

- começa às 08h00;

- pode continuar indefinidamente;

- mas tarefas após 18h00 devem gerar alertas visuais.

As tarefas devem aparecer como CARDS visuais dentro do calendário, ocupando espaço proporcional ao tempo estimado.

Os cards devem permitir:

- drag and drop;

- redimensionamento;

- edição rápida;

- mudança de prioridade;

- marcação de conclusão.

# INTEGRAÇÃO COM GOOGLE CALENDAR

O sistema deve integrar com Google Workspace / Google Calendar.

Regras:

- eventos do Google Calendar têm prioridade absoluta;

- tarefas nunca podem sobrepor eventos do calendário;

- se uma reunião for adicionada em um horário ocupado por tarefa, a tarefa e todas as subsequentes devem ser automaticamente realocadas para frente;

- a ordem relativa das tarefas deve ser preservada;

- o sistema deve procurar automaticamente os próximos espaços livres disponíveis.

Usar autenticação OAuth Google.

# LÓGICA DA FILA UNIVERSAL

Todas as tarefas pertencem a uma fila cronológica dinâmica.

O sistema deve:

- reorganizar automaticamente tarefas quando houver conflito;

- manter sequência relativa;

- recalcular horários automaticamente;

- evitar espaços ociosos entre tarefas, salvo se configurado;

- respeitar tempo estimado de cada tarefa.

Quando uma tarefa for movida manualmente:

- as demais devem se reorganizar automaticamente;

- mantendo a ordem da fila;

- evitando conflitos com calendário.

# REGRAS IMPORTANTES

## Regra 1 — Prioridade do Calendário

Eventos externos do Google Calendar sempre têm prioridade máxima.

## Regra 2 — Continuidade da Fila

A fila deve ser contínua dentro do dia.

## Regra 3 — Não Migrar de Dia

Por padrão:

- tarefas de um dia não devem migrar para outro dia.

EXCEÇÃO:

- tarefas não concluídas devem migrar automaticamente para o próximo dia;

- devem aparecer como os primeiros itens da fila do novo dia;

- as demais tarefas do dia devem ser postergadas mantendo a ordem.

## Regra 4 — Alertas de Horário

Tarefas iniciadas ou terminadas após 18h00:

- devem gerar alertas visuais;

- podem exibir badges;

- podem alterar cor do card.

# ESTRUTURA DOS CARDS DE TAREFA

Cada tarefa deve possuir:

- título;

- descrição detalhada;

- tipo da tarefa;

- projeto relacionado;

- tempo estimado;

- data limite;

- prioridade;

- status;

- indicador de tarefa pai;

- indicador de subtarefa;

- horário calculado automaticamente;

- horário real executado;

- tags;

- observações rápidas.

# TIPOS DE TAREFA

O usuário deve poder criar categorias personalizadas.

Exemplos:

- Pessoal;

- Empresa A;

- Empresa B;

- Comercial;

- Jurídico;

- Estratégia;

- Financeiro.

Cada tipo deve possuir:

- cor;

- ícone;

- filtro;

- estatísticas.

# FUNCIONALIDADES IMPORTANTES

## Drag and Drop Inteligente

Ao mover uma tarefa:

- todas as demais se reorganizam automaticamente;

- sem sobreposição;

- respeitando eventos do calendário.

## Quick Add

Campo rápido para adicionar tarefas.

Exemplo:

"Revisar contrato com João amanhã 2h"

O sistema deve interpretar:

- data;

- duração;

- contexto;

- prioridade.

## Subtarefas

Tarefas podem possuir subtarefas encadeadas.

Subtarefas:

- podem herdar contexto;

- podem ter duração própria;

- podem ser concluídas individualmente.

## Reagendamento Automático

Se uma tarefa atrasar:

- tarefas seguintes devem ser recalculadas.

## Buffer Inteligente

Adicionar automaticamente pequenos intervalos entre tarefas.

Exemplo:

- 5 minutos;

- 10 minutos;

- configurável.

# UX/UI

O design deve ser:

- extremamente limpo;

- minimalista;

- moderno;

- visualmente leve;

- com baixa carga cognitiva.

Importante:

- evitar excesso de informação;

- evitar telas poluídas;

- usar cores suaves;

- usar animações suaves;

- destacar apenas o que exige atenção.

O sistema deve transmitir:

- clareza;

- controle;

- calma;

- previsibilidade.

# FOCO EM TDAH

A experiência deve reduzir:

- ansiedade;

- overload visual;

- fadiga decisória.

Adicionar:

- foco na próxima tarefa;

- destaque visual do “agora”;

- progresso visual;

- sensação de avanço;

- feedbacks positivos sutis.

# STACK TÉCNICA

Construir utilizando:

- React;

- Next.js;

- TypeScript;

- Tailwind;

- Supabase;

- Google Calendar API;

- drag-and-drop moderno.

Preferir:

- arquitetura escalável;

- componentes reutilizáveis;

- design responsivo;

- suporte mobile;

- dark mode.

# FUNCIONALIDADES FUTURAS

Estruturar arquitetura pensando em:

- IA para sugestão automática de agenda;

- estimativa inteligente de duração;

- priorização automática;

- integração com WhatsApp;

- integração com email;

- voice input;

- dashboards de produtividade;

- analytics comportamentais;

- gamificação leve;

- notificações inteligentes;

- modo foco.

# IMPORTANTE

Quero que o sistema seja construído inicialmente como um MVP funcional, mas com arquitetura preparada para crescimento futuro.

Quero:

- telas principais;

- estrutura de banco;

- componentes reutilizáveis;

- integração real com Google Calendar;

- lógica de reagendamento automático;

- drag and drop funcional;

- interface extremamente refinada.

Comece criando:

1. arquitetura do projeto;

2. schema do banco;

3. principais componentes;

4. fluxo de funcionamento;

5. e a tela principal do calendário.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://task-manager-bmp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b031cc7e-4c64-461c-97b9-811fe3ab37e6).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
