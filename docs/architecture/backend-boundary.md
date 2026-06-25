# Backend boundary — Supabase × NestJS

> Status: descrição do estado atual (auditoria 2026-06).
> Próximo passo: discutir consolidação após Fases 1 e 2 estarem em prod.

O sistema mantém dois backends paralelos que validam o mesmo JWT emitido
pelo Supabase Auth. Esta nota define qual é a **fonte de verdade** para
cada entidade — referência para futuras decisões de "onde escrevo isso".

## Fontes de verdade

| Entidade                                    | Fonte de verdade                | Observação                                                                                  |
| ------------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------- |
| Identidade do usuário (auth.users, profile) | Supabase Auth + `profiles`      | RLS por `auth.uid()`. Backend NestJS apenas valida o JWT, nunca grava em `auth.*`.          |
| Preferências de UI (`user_preferences`)     | Supabase                        | Lido/escrito pelos stores Zustand via `user-prefs-db.ts`.                                   |
| Notificações persistentes                   | Supabase (`user_notifications`) | Limpeza por `pg_cron` (30/90 dias).                                                         |
| Configuração do Bot4x (`bot4x_configs`)     | Supabase                        | RLS por user_id. Backend NestJS lê via `bot4x-adapter` quando precisa executar ordens.     |
| Histórico de trades (`bot4x_trades`)        | Supabase                        | Após DB-02, policy de UPDATE existe; upsert em retries é seguro.                            |
| Execução real do Bot4x (modo REAL)          | Backend NestJS                  | Quando `VITE_BOT4X_REAL_ENABLED=true`. O NestJS deve gravar o trade no Supabase ao fechar. |
| Sinais (tabela `signals`)                   | Supabase                        | AI score/reasoning vêm de pipeline externo (ver SEG-03 da auditoria).                       |
| Histórico do Copilot                        | Supabase (`copilot_history`)    | Backend NestJS pode produzir streaming via WS, mas a persistência final é Supabase.         |
| Sessão em tempo real / streams              | Backend NestJS (WebSocket)      | `ws-client.ts` exige `wss://` em produção (já corrigido).                                   |
| Fila de e-mail                              | Supabase (`pgmq` + `pg_cron`)   | Worker em `src/routes/lovable/email/queue/process.ts`.                                      |

## Autenticação entre camadas

1. Cliente browser obtém JWT do Supabase Auth (`@supabase/supabase-js`).
2. Para Supabase: o JWT vai no header `Authorization: Bearer ...` em cada
   request da Data API; RLS aplica como o usuário autenticado.
3. Para o backend NestJS: o mesmo JWT vai no `Authorization` header (anexado
   pelo interceptor em `src/lib/apiClient.ts`). O NestJS é responsável por
   validar a assinatura usando a JWKS pública do Supabase.

## Limitações conhecidas (não resolvidas)

- **Sem transação distribuída.** Se o NestJS fecha uma ordem real mas
  falha ao replicar o trade no Supabase (ou vice-versa), os dois bancos
  divergem. Não há saga/outbox implementada. Compensar manualmente.
- **Observabilidade fragmentada.** Logs do worker Supabase, do edge route
  TanStack e do NestJS vivem em três lugares diferentes. Não há `trace_id`
  propagado por header. Adicionar OpenTelemetry com um cabeçalho
  `x-trace-id` em ambos os lados é o próximo passo natural.
- **Sobrecarga semântica em `bot4x_configs`** (legado): migração ARCH-02
  adicionou colunas com nomes corretos (`sl_pct`, `tp_pct`,
  `allocation_pct`, `total_capital`, `preferred_pairs`, `avoid_pairs`),
  mas as colunas antigas reaproveitadas (`rsi_threshold_low/high`,
  `ai_score_min`, `fomo_limit`, `exchange`) ainda existem para
  compatibilidade. Plano: depreciar em migração futura após confirmar
  que nenhum consumidor externo (BI, suporte) ainda lê delas.

## Recomendação de médio prazo

Avaliar se o backend NestJS pode ser absorvido por:

- `createServerFn` do TanStack Start (lógica RPC server-side, mesmo bundle).
- Edge Functions Supabase (para webhooks externos e jobs de longa duração).

Vantagens: um único deploy, observabilidade unificada, fim das duas
camadas de validação de JWT. Custo: reescrever o motor real do bot e os
streams WS num modelo serverless — não trivial e fora do escopo das
Fases 1/2 desta auditoria.
