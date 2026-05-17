## Resumo

Habilitar login por **e-mail/senha** convivendo com o Google atual, e desacoplar a sincronização do Google Calendar do método de login — passando a usar a tabela `google_connections` (que já existe e tem `refresh_token`) para sync sob demanda, mesmo de quem entra com e-mail.

## Decisões confirmadas

- Manter os dois métodos de login (Google + e-mail/senha).
- Sync **sob demanda** (botão), sem cron — mas com token persistente (refresh_token salvo).
- **Auto-confirmar** cadastros (sem verificação de e-mail).

## O que muda

### 1. Auth (Supabase)
- `configure_auth`: `auto_confirm_email: true`, `password_hibp_enabled: true` (proteção contra senhas vazadas).
- Google permanece como provider habilitado.

### 2. Tela `/login`
Refatorar `src/routes/login.tsx`:
- Form principal: **e-mail + senha** com tabs "Entrar" / "Criar conta".
- Botão secundário "Entrar com Google" (fluxo `lovable.auth.signInWithOAuth` que já existe).
- Link "Esqueci minha senha" → `supabase.auth.resetPasswordForEmail` com `redirectTo: ${origin}/reset-password`.

### 3. Nova rota `/reset-password`
Página pública que detecta `type=recovery` no hash e chama `supabase.auth.updateUser({ password })`.

### 4. Calendar deixa de depender do `provider_token` da sessão
Hoje `CalendarSyncButton` lê `session.provider_token` — isso só funciona logo após login Google e expira em ~1h. Vamos centralizar em `google_connections`:

- **Quem entra com Google**: ao detectar `provider_token` + `provider_refresh_token` na sessão (via `onAuthStateChange`), gravar/atualizar `google_connections` (`access_token`, `refresh_token`, `expires_at`). Server function `upsertGoogleConnection`.
- **Quem entra com e-mail**: nova tela em Configurações com botão **"Conectar Google Calendar"** que dispara um OAuth próprio (popup) com `access_type=offline` + `prompt=consent` e grava os tokens no `google_connections`.
- **Sync** (`syncCalendarRange`): em vez de receber `provider_token` do cliente, lê `google_connections` server-side; se `expires_at < now()`, refaz via `refresh_token` (endpoint `oauth2.googleapis.com/token`) e atualiza a linha. Botão de sync no header só verifica se existe conexão; se não, mostra "Conecte seu Google Calendar".

### 5. Tela de Configurações → seção "Conexões"
- Mostra status: "Google Calendar conectado · última sync HH:mm" ou CTA de conectar.
- Botão "Desconectar" (apaga linha em `google_connections`).

## Secrets necessários

Para o fluxo de e-mail (atual login Google usa OAuth gerenciado pelo Lovable, que **não expõe `refresh_token`**), precisamos de credenciais OAuth próprias para o connector de Calendar:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Você cria em Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (Web). Habilita Google Calendar API. Adiciona como redirect URI: `https://<seu-domínio-lovable>/api/public/google/callback`.

Vou pedir esses secrets via `add_secret` na hora da implementação e te passo o passo-a-passo de criação no Google Cloud.

## Detalhes técnicos

```text
src/
├── routes/
│   ├── login.tsx                       # refatorado: tabs e-mail/senha + Google
│   ├── reset-password.tsx              # novo, público
│   ├── _authenticated/
│   │   └── app.settings.tsx            # + seção "Conexões"
│   └── api/public/google/
│       ├── start.ts                    # novo: inicia OAuth próprio (state CSRF)
│       └── callback.ts                 # novo: troca code → tokens, grava google_connections
├── lib/
│   ├── google/
│   │   ├── tokens.functions.ts         # novo: getValidAccessToken (refresh on demand)
│   │   └── connection.functions.ts     # novo: upsert/disconnect server fns
│   └── calendar.functions.ts           # editado: usa google_connections em vez de provider_token
└── components/week-calendar/
    └── calendar-sync-button.tsx        # editado: sem provider_token; chama syncCalendarRange direto
```

## Fora de escopo

- Cron / sync em background (decidiu não).
- Migração forçada de contas existentes — usuários atuais (login Google) continuam funcionando; podem definir senha depois em Configurações se quiserem.
- Microsoft/Apple SSO.

## Riscos

- A sessão Google atual via broker do Lovable **não devolve `provider_refresh_token`** consistentemente. Se confirmarmos isso, mesmo quem loga com Google vai precisar passar uma vez pelo "Conectar Calendar" para liberar refresh persistente. Vou testar e ajustar.
- Mudar `calendar.functions.ts` para ler tokens do DB altera a assinatura de `syncCalendarRange` — `CalendarSyncButton` precisa ser atualizado no mesmo PR para não quebrar.
