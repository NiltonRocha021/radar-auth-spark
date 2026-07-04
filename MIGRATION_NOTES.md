# MIGRATION_NOTES

Rastreamento vivo da migração "zero NestJS": tudo que hoje ainda depende do backend
NestJS externo é considerado **transitório** e será absorvido como server function
neste projeto (TanStack Start + Supabase / Lovable Cloud) nas fases planejadas.

Este documento é a fonte de verdade sobre "quem sai quando". Se algo aqui
divergir do código, o código é o certo — atualize este arquivo.

## Convenções

- **Estado**: `mantido` (padrão definitivo) · `transitório` (será removido) · `removido`
- **Fase**: quando o item deixa de existir (ou já deixou)

---

## Fundação (mantido — padrão definitivo daqui pra frente)

| Item | Estado | Notas |
|---|---|---|
| Auth via SSR cookies (`@supabase/ssr` + `server-session.ts` + `beforeLoad` em `_authenticated.tsx`) | mantido | Bloco C do plan.md, implementado na fase-ponte. Nenhuma fase futura deve mexer. |
| `trade_outbox` + `saveTradeWithOutbox()` | mantido | Continua sendo o mecanismo de confiabilidade quando a Fase 4 mover a execução da Binance para dentro do Worker. |
| `timingSafeEqual` para `*_CRON_SECRET` | mantido | Obrigatório para todo cron secret introduzido nas Fases 5 e 8. |
| RLS + GRANTs explícitos em snake_case (`bot4x_configs`, `bot4x_trades`, `signals`, `copilot_history`, ...) | mantido | Nomenclatura estabelecida — usar para toda tabela nova. |
| `gitleaks` workflow, `.env` fora do repo, setup Vitest | mantido | — |

## Transitórios — desmonte por fase

| Arquivo | Estado | Fase de desmonte | O que substitui |
|---|---|---|---|
| `src/adapters/backend/auth.adapter.ts` | **removido** (fase-ponte) | — | Chamadas diretas a `supabase.auth.*` (`useBackendAuth`, `ws-client`, `ws-client-shared`). |
| `src/adapters/backend/dna.adapter.ts` | transitório | Fase 2/3 | `dna.functions.ts` (createServerFn) lendo de `dna_profiles` / `dna_learning_events`. |
| `src/adapters/backend/signal.adapter.ts` | transitório | Fase 2/3 | `signals.functions.ts` já existente ganha o read-side; adapter sai. |
| `src/adapters/backend/manipulation.adapter.ts` | transitório | Fase 2/3 | `manipulation.functions.ts` lendo de `manipulation_alerts`. |
| `src/adapters/backend/calibrator.adapter.ts` | transitório | Fase 2/3 | `calibrator.functions.ts` lendo de `calibrator_runs` (já existe). |
| `src/adapters/backend/bot4x.adapter.ts` | transitório | Fase 3/4 | Execução real do bot vira server function + `fetch` direto para Binance. |
| `src/adapters/backend/copilot.adapter.ts` | transitório | Fase 6 | Streaming migra para server fn + Lovable AI Gateway (ou short-polling — decisão documentada na Fase 6). |
| `src/adapters/backend/ws-client.ts` | transitório | Fase 6 | Sem consumidor após Fase 6. |
| `src/adapters/backend/ws-client-shared.ts` | transitório | Fase 6 | idem. |
| `src/workers/ws-shared-worker.ts` | transitório | Fase 6 | idem. |
| `src/adapters/backend/api.adapter.ts` | transitório | Fase 6 | Sai com o último consumidor do NestJS. |
| `src/lib/apiClient.ts` | transitório | Fase 6 | idem — não haverá mais backend externo para chamar. |
| `src/hooks/useBackendAuth.ts` | transitório | Fase 6 | Substituído por `useAuth()` (já existe) uma vez que nenhum consumidor dependa mais do "userId do backend". |
| `VITE_API_BASE_URL` / `VITE_API_WS_URL` no `.env` | transitório | Fase 6 | Removidas quando os arquivos acima saírem. |

## Exceções documentadas em auto-generated

- `src/integrations/supabase/client.ts` foi editado manualmente na fase-ponte
  (Bloco C do plan.md) para trocar `createClient` puro por `createBrowserClient`
  do `@supabase/ssr`. Se o Lovable Cloud regenerar este arquivo, esta edição
  precisa ser reaplicada.

## Fase 1 — schema

**Já existentes (não recriar):** `profiles`, `user_roles` (+ enum `app_role`),
`bot4x_configs`, `bot4x_trades`, `signals`, `copilot_history`, `trade_outbox`,
`user_notifications`, `user_preferences`, `alert_dispatch_queue`,
`alert_events`, `alert_preferences`, `admin_audit_log`, `rate_limits`,
`rate_limits_by_key`, `rate_limit_policies`, `email_send_log`,
`email_send_state`, `email_unsubscribe_tokens`, `suppressed_emails`,
`calibrator_runs`.

**Criadas na fase-ponte:** `market_ohlcv`, `market_snapshot`, `dna_profiles`,
`dna_learning_events`, `bot_cop_decisions`, `simulation_runs`,
`simulation_results`, `event_log`, `symbol_sequencer`, `manipulation_alerts`,
`subscribers`, `subscriber_executions`, `signal_subscriptions`, `risk_audit`.

**Decisão de logs (aprovada):** manter dois destinos, sem criar um terceiro
`audit_log` genérico do Prisma. `admin_audit_log` continua sendo o log de
ações administrativas (quem fez o quê no painel de admin). `event_log` é o
destino unificado para eventos operacionais do produto (bot pausado, erros
de execução, quota, dispatches de alerta, etc.). Toda nova instrumentação
operacional escreve em `event_log`.
