-- =========================================================================
-- Fase 3.1: user_two_factor, bot_system_state, orders (com mode DEMO/LIVE)
-- Trigger prevent_plan_tier_self_escalation já existe (migration anterior).
-- =========================================================================

-- ---------- user_two_factor ---------------------------------------------
CREATE TABLE public.user_two_factor (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  secret        TEXT NOT NULL,
  backup_codes  TEXT[] NOT NULL DEFAULT '{}',
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_at    TIMESTAMPTZ,
  last_used_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_two_factor TO authenticated;
GRANT ALL ON public.user_two_factor TO service_role;

ALTER TABLE public.user_two_factor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own 2fa"
  ON public.user_two_factor FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own 2fa"
  ON public.user_two_factor FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own 2fa"
  ON public.user_two_factor FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own 2fa"
  ON public.user_two_factor FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_two_factor_updated_at
  BEFORE UPDATE ON public.user_two_factor
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------- bot_system_state --------------------------------------------
CREATE TYPE public.bot_state AS ENUM ('ACTIVE', 'INACTIVE', 'PAUSED');

CREATE TABLE public.bot_system_state (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state       public.bot_state NOT NULL DEFAULT 'INACTIVE',
  reason      TEXT,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_system_state TO authenticated;
GRANT ALL ON public.bot_system_state TO service_role;

ALTER TABLE public.bot_system_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own bot state"
  ON public.bot_system_state FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own bot state"
  ON public.bot_system_state FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own bot state"
  ON public.bot_system_state FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_bot_system_state_updated_at
  BEFORE UPDATE ON public.bot_system_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ---------- orders (DEMO/LIVE) ------------------------------------------
CREATE TABLE public.orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode          TEXT NOT NULL DEFAULT 'DEMO' CHECK (mode IN ('DEMO','LIVE')),
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type    TEXT NOT NULL DEFAULT 'MARKET' CHECK (order_type IN ('MARKET','LIMIT')),
  quantity      NUMERIC NOT NULL CHECK (quantity > 0),
  entry_price   NUMERIC NOT NULL CHECK (entry_price > 0),
  exit_price    NUMERIC,
  stop_loss     NUMERIC,
  take_profit   NUMERIC,
  pnl           NUMERIC,
  pnl_pct       NUMERIC,
  status        TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  signal_id     UUID,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX orders_user_status_idx ON public.orders (user_id, status, opened_at DESC);
CREATE INDEX orders_user_mode_idx   ON public.orders (user_id, mode, opened_at DESC);
CREATE INDEX orders_symbol_idx      ON public.orders (symbol, opened_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own orders"
  ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own orders"
  ON public.orders FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();