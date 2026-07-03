
# Fase-ponte: redirecionar para "zero NestJS"

> **Estado real (atualizado ao fim da fase-ponte):** entregas 1–4 abaixo
> executadas. Bloco C (SSR cookies) do plano original — que ficou registrado
> como concluído em versões anteriores deste arquivo, mas nunca foi de fato
> implementado — foi executado agora, nesta fase-ponte. Estado item-por-item
> vive em `MIGRATION_NOTES.md` na raiz do repo.

Vou executar o pedido em quatro entregas, nesta ordem, com stops para você revisar antes de eu prosseguir para a Fase 2 corrigida.


---

## Entrega 1 — Correção de segurança do Bloco C (SSR cookies)

### O que muda

- `bun add @supabase/ssr`.
- Novo `src/integrations/supabase/server-session.ts` exportando `getServerSupabase()` que lê/escreve cookies via `getRequest()` / `setCookie` do `@tanstack/react-start/server`, usando `createServerClient` do `@supabase/ssr`.
- `src/integrations/supabase/client.ts` (auto-generated): substituir o `createClient` puro por `createBrowserClient` do `@supabase/ssr` para o browser passar a persistir a sessão em cookie em vez de `localStorage`. Vou preservar o cabeçalho "auto-generated" e adicionar um bloco de comentário explicando a exceção — o próprio `plan.md` original já assumia essa divergência.
- `src/lib/server-auth.ts` / `getAuthSession`: usar `getServerSupabase()` primeiro (cookie), fallback para bearer para chamadas de server fn client-side. Retorna o mesmo DTO.
- `src/routes/_authenticated.tsx`: `beforeLoad` passa a poder `redirect({ to: "/login" })` no SSR quando `!isAuthenticated`, sem risco de loop porque a sessão agora chega via cookie. Remove `TODO(seg)` e o guard `typeof window !== "undefined"`.
- `src/routes/__root.tsx`: nada a fazer no shell — o `AuthProvider` client já reage a `onAuthStateChange`; só valido que continua funcionando com o `createBrowserClient`.

### Riscos que reconheço e como mitigo

- **`_authenticated/route.tsx` gerenciado pelo Lovable**: neste projeto o layout autenticado vive em `src/routes/_authenticated.tsx` (arquivo do usuário), não em `_authenticated/route.tsx` gerenciado. Confirmei acima. Vou tocar só o do usuário.
- **`client.ts` marcado auto-generated**: o `plan.md` original já reconhece essa exceção. Mantenho o cabeçalho, documento no MIGRATION_NOTES.md e no commit.
- **`attachSupabaseAuth` client-side**: continua válido — server fns chamadas via RPC ainda anexam bearer. O cookie só serve para hidratar SSR.
- **Redirect loop em hard refresh**: risco real se o cookie não for setado corretamente na resposta. Vou validar com Playwright (login → refresh → logout → acesso direto).

### Validação

Playwright: login com sessão injetada → hard refresh em rota protegida → logout → tentativa de `/dashboard` deslogado → confirma redirect para `/login`. Screenshots em cada passo.

---

## Entrega 2 — Desmonte imediato de `auth.adapter.ts`

- `src/hooks/useBackendAuth.ts`: passa a usar `supabase.auth.getSession()` direto e (por enquanto) só expõe `{ userId, ready }` baseado na sessão local. `getMe()` → removido. Adiciono TODO de que este hook inteiro sai na Fase 6 quando não sobrar consumidor.
- `src/adapters/backend/ws-client.ts` e `ws-client-shared.ts`: as duas únicas outras call-sites de `authAdapter`. Trocam a chamada para `supabase.auth.getSession()` direto (só precisam do access token).
- Remover `src/adapters/backend/auth.adapter.ts` e a linha `export * from "./auth.adapter"` de `src/adapters/backend/index.ts`.

---

## Entrega 3 — Marcações TODO nos transitórios (sem apagar nada)

Adiciono comentário no topo de cada arquivo indicando a fase de desmonte:

- `src/lib/apiClient.ts` → Fase 6
- `src/adapters/backend/bot4x.adapter.ts` → Fase 3/4
- `src/adapters/backend/dna.adapter.ts` → Fase 2/3
- `src/adapters/backend/manipulation.adapter.ts` → Fase 2/3
- `src/adapters/backend/signal.adapter.ts` → Fase 2/3
- `src/adapters/backend/calibrator.adapter.ts` → Fase 2/3
- `src/adapters/backend/api.adapter.ts` → Fase 6 (base compartilhada; sai com o último consumidor)
- `src/adapters/backend/copilot.adapter.ts`, `ws-client.ts`, `ws-client-shared.ts`, `src/workers/ws-shared-worker.ts` → Fase 6

Crio `MIGRATION_NOTES.md` na raiz listando cada um com seu estado (mantido / transitório / removido) e a fase de desmonte planejada.

Atualizo `.lovable/plan.md` para refletir que o Bloco C foi de fato executado nesta fase-ponte (não antes), e `docs/architecture/backend-boundary.md` para marcar a intenção "zero NestJS" e listar quais adapters ainda são fonte de verdade transitória.

---

## Entrega 4 — Fase 1 corrigida: schema restante

Uma migração Supabase criando as tabelas que faltam, seguindo snake_case, RLS + GRANTs no padrão das existentes:

`market_ohlcv`, `market_snapshot`, `dna_profiles`, `dna_learning_events`, `bot_cop_decisions`, `simulation_runs`, `simulation_results`, `event_log`, `symbol_sequencer`, `manipulation_alerts`, `subscribers`, `subscriber_executions`, `signal_subscriptions`, `risk_audit`.

**Ponto a confirmar antes de eu criar**: `AuditLog` genérico do Prisma vs `admin_audit_log` já existente. Vou pular por ora e perguntar no meu report final se você quer criar um `event_log` unificado (que já está na lista) ou um `audit_log` separado do admin.

Para cada tabela: `id uuid pk`, `user_id uuid` quando aplicável com FK a `auth.users`, `created_at`/`updated_at` com trigger `set_updated_at`, RLS enabled, policies `TO authenticated USING (auth.uid() = user_id)`, `GRANT ... TO authenticated` e `GRANT ALL ... TO service_role`. Tabelas de leitura pública/global (market_ohlcv, market_snapshot, symbol_sequencer) recebem policy de SELECT ampla e `GRANT SELECT TO anon` só quando fizer sentido.

Migration única, descrição clara, aguardo aprovação.

---

## Stop e report

Depois das 4 entregas rodo:

- `bun run build` + typecheck
- Playwright do fluxo de auth cookies
- Diff resumido de cada entrega

E paro. Não sigo para a Fase 2 corrigida (converter *-data.ts / *-store.ts em createServerFn) sem seu OK e sem o levantamento que você pediu (quais já são read-side puros vs quais chamam adapter/NestJS).

## Fora de escopo desta entrega

- Fase 2 em diante.
- Testes automatizados novos além do smoke Playwright do auth.
- Remoção real dos adapters marcados TODO — só comentário, código fica funcionando.

