-- Security hardening: client-authenticated users must not mutate trading
-- records or execution configuration directly. Server functions use the
-- server-only Supabase client and enforce context.userId before writes.
--
-- Keep SELECT access for user-facing reads where needed. No authenticated
-- INSERT/UPDATE/DELETE remains on these tables.

-- orders: only server-side pipeline may create/close/cancel orders.
REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
DROP POLICY IF EXISTS "Users insert own orders" ON public.orders;
DROP POLICY IF EXISTS "Users update own orders" ON public.orders;
DROP POLICY IF EXISTS "Users delete own orders" ON public.orders;

-- bot4x_configs: configuration writes go through updateBotConfig, which
-- validates the authenticated context and persists with supabaseAdmin.
REVOKE INSERT, UPDATE, DELETE ON public.bot4x_configs FROM authenticated;
DROP POLICY IF EXISTS "bot4x_configs_own" ON public.bot4x_configs;

-- Recreate a read-only owner policy for the frontend/server read path.
CREATE POLICY "Users read own bot4x config"
  ON public.bot4x_configs
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- bot4x_trades: persistence is now routed through bot4x-trades.functions.ts.
REVOKE INSERT, UPDATE, DELETE ON public.bot4x_trades FROM authenticated;
DROP POLICY IF EXISTS "Users insert own trades" ON public.bot4x_trades;
DROP POLICY IF EXISTS "Users update own trades" ON public.bot4x_trades;
DROP POLICY IF EXISTS "Users delete own trades" ON public.bot4x_trades;

-- trade_outbox is an internal persistence mechanism; all access is
-- server-side now.
REVOKE ALL ON public.trade_outbox FROM authenticated;
DROP POLICY IF EXISTS "Users read own outbox" ON public.trade_outbox;
DROP POLICY IF EXISTS "Users insert own outbox" ON public.trade_outbox;
DROP POLICY IF EXISTS "Users update own outbox" ON public.trade_outbox;
