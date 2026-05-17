## O problema

O sistema parece instável porque há um **loop de redirecionamento** entre `/login` e `/app/week`. Veja o que está acontecendo:

1. `src/routes/_authenticated.tsx` faz, no `beforeLoad`:
   ```ts
   const { data } = await supabase.auth.getSession();
   if (!data.session) throw redirect({ to: "/login" });
   ```
2. `beforeLoad` roda **tanto no servidor (SSR) quanto no cliente**.
3. No servidor não existe `localStorage`, então `supabase.auth.getSession()` **sempre retorna `null`** — independente de você estar logado.
4. Resultado: toda navegação SSR (clicar num link, dar refresh, prefetch ao passar o mouse sobre um link com `defaultPreloadStaleTime: 0`) joga você de volta para `/login`.
5. No cliente, a sessão existe → a `/login` te manda para `/app/week` → próximo SSR te manda de volta para `/login` → flicker, sensação de "travado".

Os logs confirmam: você está autenticado (várias chamadas `/_serverFn/...` retornam 200 com token Bearer válido), mas a UI continua oscilando para `/login`.

Os erros antigos de `@dnd-kit/core`, `ai`, `@ai-sdk/openai-compatible` já foram resolvidos — não fazem mais parte do problema atual.

## Correção

Mover a checagem de sessão para o cliente, mantendo a UX de redirect-to-login.

### 1. `src/routes/_authenticated.tsx`
- Remover `getSession()` do `beforeLoad`.
- Trocar por uma checagem **client-side**: o componente `AppShell` usa um hook tipo `useAuthReady` que:
  - chama `supabase.auth.getSession()` uma vez no `useEffect`,
  - escuta `onAuthStateChange`,
  - retorna `{ user, isReady }`.
- Enquanto `!isReady`, renderiza um placeholder neutro (mesmo bg) — evita flash.
- Quando `isReady && !user`, faz `router.navigate({ to: "/login" })`.
- Quando `isReady && user`, renderiza o `<Outlet />`.

Isso elimina o redirect SSR-falso-negativo sem flash de conteúdo protegido (a UI fica em loading até o cliente confirmar sessão).

### 2. `src/routes/login.tsx`
- Usar o mesmo hook `useAuthReady` em vez de chamar `getSession()` direto.
- Só redireciona para `/app/week` depois que `isReady === true`.
- Evita o ping-pong quando o usuário chega na `/login` autenticado.

### 3. Novo arquivo `src/hooks/use-auth-ready.ts`
Hook compartilhado conforme o padrão recomendado para Supabase + TanStack Start:
```ts
export function useAuthReady() {
  const [state, setState] = useState({ user: null, isReady: false });
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ user: data.session?.user ?? null, isReady: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setState({ user: session?.user ?? null, isReady: true });
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return state;
}
```

### 4. Verificação
- Abrir `/app/week` logado → não deve mais piscar para `/login`.
- Refresh em `/app/week` → continua na página (após pequeno flash de loading).
- Logout via botão "Sair" → vai para `/login` e fica lá.
- Acessar `/login` já logado → redireciona para `/app/week`.

## Fora de escopo

- Warning de hidratação `data-scribe-recorder-ready` (vem de uma extensão do navegador, não é bug do app).
- Quaisquer mudanças visuais — só lógica de auth.
