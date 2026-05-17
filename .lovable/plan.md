# Proteção contra falhas de SSR

Vou aplicar as 4 camadas de proteção recomendadas para TanStack Start, garantindo que qualquer erro de renderização no servidor seja capturado e mostre uma página de erro amigável ao invés de tela branca.

## O que será feito

1. **`vite.config.ts`** — apontar o `tanstackStart.server.entry` para `src/server.ts`, garantindo que nosso wrapper seja realmente executado no build de produção.

2. **`src/server.ts`** — wrapper com:
   - import lazy do handler do TanStack (captura erros de inicialização de módulo)
   - try/catch ao redor do `fetch`
   - normalização de respostas 500 "engolidas" pelo h3 em uma página HTML legível

3. **`src/lib/error-capture.ts`** — listeners globais (`error`, `unhandledrejection`) que guardam o último erro por 5s para correlacionar com respostas 500 sem stack.

4. **`src/lib/error-page.ts`** — HTML estático auto-contido (sem dependências do app) com botões "Tentar novamente" e "Início". Já existe — vou verificar e ajustar se necessário.

5. **`src/router.tsx`** — adicionar `defaultErrorComponent` como rede de segurança extra para erros em runtime de rotas.

6. **`src/routes/__root.tsx`** — já tem `errorComponent`; vou confirmar que está registrado corretamente.

## Resultado esperado

- Erros de SSR aparecem nos Server Logs com stack trace completo.
- Usuário nunca mais vê tela branca — sempre cai numa página de erro com opção de recarregar.
- Glitches transitórios de build não derrubam o preview.

## Detalhes técnicos

- `vite.config.ts` usa `defineConfig` de `@lovable.dev/vite-tanstack-config`; passar `tanstackStart: { server: { entry: "server" } }`.
- `wrangler.jsonc` já aponta `main: "src/server.ts"` ✓
- `src/server.ts` precisa ser reescrito com import dinâmico + `normalizeCatastrophicSsrResponse`.
- Nenhuma mudança em rotas, componentes ou banco de dados.
