
-- =========================================================================
-- FASE 1 (schema restante) — tabelas do plano "zero NestJS"
-- Seguem convenção snake_case, RLS + GRANTs explícitos, timestamps padrão.
-- =========================================================================

-- ---------- MARKET_OHLCV (leitura pública) ----------
CREATE TABLE public.market_ohlcv (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  open_time TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  quote_volume NUMERIC,
  trades INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (symbol, timeframe, open_time)
);
CREATE INDEX idx_market_ohlcv_symbol_tf_time ON public.market_ohlcv (symbol, timeframe, open_time DESC);
GRANT SELECT ON public.market_ohlcv TO anon, authenticated;
GRANT ALL ON public.market_ohlcv TO service_role;
ALTER TABLE public.market_ohlcv ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_ohlcv is public read"
  ON public.market_ohlcv FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------- MARKET_SNAPSHOT (leitura pública) ----------
CREATE TABLE public.market_snapshot (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  price NUMERIC NOT NULL,
  volume_24h NUMERIC,
  market_cap NUMERIC,
  change_24h NUMERIC,
  source TEXT,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_market_snapshot_symbol_time ON public.market_snapshot (symbol, captured_at DESC);
GRANT SELECT ON public.market_snapshot TO anon, authenticated;
GRANT ALL ON public.market_snapshot TO service_role;
ALTER TABLE public.market_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_snapshot is public read"
  ON public.market_snapshot FOR SELECT
  TO anon, authenticated
  USING (true);

-- ---------- SYMBOL_SEQUENCER (leitura pública) ----------
CREATE TABLE public.symbol_sequencer (
  symbol TEXT NOT NULL PRIMARY KEY,
  next_seq BIGINT NOT NULL DEFAULT 0,
  cursor TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symbol_sequencer TO anon, authenticated;
GRANT ALL ON public.symbol_sequencer TO service_role;
ALTER TABLE public.symbol_sequencer ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symbol_sequencer is public read"
  ON public.symbol_sequencer FOR SELECT
  TO anon, authenticated
  USING (true);
CREATE TRIGGER trg_symbol_sequencer_updated_at
  BEFORE UPDATE ON public.symbol_sequencer
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- DNA_PROFILES ----------
CREATE TABLE public.dna_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  temperament TEXT,
  score NUMERIC,
  risk_appetite NUMERIC,
  patience_score NUMERIC,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dna_profiles TO authenticated;
GRANT ALL ON public.dna_profiles TO service_role;
ALTER TABLE public.dna_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dna_profiles owner select" ON public.dna_profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dna_profiles owner insert" ON public.dna_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dna_profiles owner update" ON public.dna_profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dna_profiles owner delete" ON public.dna_profiles FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_dna_profiles_updated_at
  BEFORE UPDATE ON public.dna_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- DNA_LEARNING_EVENTS ----------
CREATE TABLE public.dna_learning_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  weight NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_dna_learning_events_user_time ON public.dna_learning_events (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.dna_learning_events TO authenticated;
GRANT ALL ON public.dna_learning_events TO service_role;
ALTER TABLE public.dna_learning_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dna_learning_events owner select" ON public.dna_learning_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "dna_learning_events owner insert" ON public.dna_learning_events FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dna_learning_events owner delete" ON public.dna_learning_events FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- BOT_COP_DECISIONS ----------
CREATE TABLE public.bot_cop_decisions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  score NUMERIC,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bot_cop_decisions_user_time ON public.bot_cop_decisions (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.bot_cop_decisions TO authenticated;
GRANT ALL ON public.bot_cop_decisions TO service_role;
ALTER TABLE public.bot_cop_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_cop_decisions owner select" ON public.bot_cop_decisions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "bot_cop_decisions owner insert" ON public.bot_cop_decisions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bot_cop_decisions owner delete" ON public.bot_cop_decisions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- SIMULATION_RUNS ----------
CREATE TABLE public.simulation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_simulation_runs_user_time ON public.simulation_runs (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulation_runs TO authenticated;
GRANT ALL ON public.simulation_runs TO service_role;
ALTER TABLE public.simulation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simulation_runs owner select" ON public.simulation_runs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "simulation_runs owner insert" ON public.simulation_runs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "simulation_runs owner update" ON public.simulation_runs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "simulation_runs owner delete" ON public.simulation_runs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_simulation_runs_updated_at
  BEFORE UPDATE ON public.simulation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- SIMULATION_RESULTS ----------
CREATE TABLE public.simulation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.simulation_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_simulation_results_run ON public.simulation_results (run_id);
CREATE INDEX idx_simulation_results_user_time ON public.simulation_results (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.simulation_results TO authenticated;
GRANT ALL ON public.simulation_results TO service_role;
ALTER TABLE public.simulation_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simulation_results owner select" ON public.simulation_results FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "simulation_results owner insert" ON public.simulation_results FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "simulation_results owner delete" ON public.simulation_results FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- EVENT_LOG (leitura autenticada, escrita service_role) ----------
-- Distinto do admin_audit_log (que é específico da área admin).
CREATE TABLE public.event_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  source TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_log_user_time ON public.event_log (user_id, created_at DESC);
CREATE INDEX idx_event_log_type_time ON public.event_log (event_type, created_at DESC);
GRANT SELECT ON public.event_log TO authenticated;
GRANT ALL ON public.event_log TO service_role;
ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "event_log owner select" ON public.event_log FOR SELECT
  TO authenticated USING (user_id IS NULL OR auth.uid() = user_id);

-- ---------- MANIPULATION_ALERTS (leitura autenticada, escrita service_role) ----------
CREATE TABLE public.manipulation_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_manipulation_alerts_symbol_time ON public.manipulation_alerts (symbol, detected_at DESC);
CREATE INDEX idx_manipulation_alerts_severity_time ON public.manipulation_alerts (severity, detected_at DESC);
GRANT SELECT ON public.manipulation_alerts TO authenticated;
GRANT ALL ON public.manipulation_alerts TO service_role;
ALTER TABLE public.manipulation_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manipulation_alerts read for authenticated"
  ON public.manipulation_alerts FOR SELECT
  TO authenticated USING (true);

-- ---------- SUBSCRIBERS (dono = user_id) ----------
CREATE TABLE public.subscribers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscribers_user ON public.subscribers (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscribers TO authenticated;
GRANT ALL ON public.subscribers TO service_role;
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscribers owner select" ON public.subscribers FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "subscribers owner insert" ON public.subscribers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscribers owner update" ON public.subscribers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscribers owner delete" ON public.subscribers FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_subscribers_updated_at
  BEFORE UPDATE ON public.subscribers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- SUBSCRIBER_EXECUTIONS ----------
CREATE TABLE public.subscriber_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  detail TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriber_executions_sub_time ON public.subscriber_executions (subscriber_id, executed_at DESC);
CREATE INDEX idx_subscriber_executions_user_time ON public.subscriber_executions (user_id, executed_at DESC);
GRANT SELECT, INSERT, DELETE ON public.subscriber_executions TO authenticated;
GRANT ALL ON public.subscriber_executions TO service_role;
ALTER TABLE public.subscriber_executions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriber_executions owner select" ON public.subscriber_executions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "subscriber_executions owner insert" ON public.subscriber_executions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "subscriber_executions owner delete" ON public.subscriber_executions FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- SIGNAL_SUBSCRIPTIONS ----------
CREATE TABLE public.signal_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_source TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, signal_source)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signal_subscriptions TO authenticated;
GRANT ALL ON public.signal_subscriptions TO service_role;
ALTER TABLE public.signal_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_subscriptions owner select" ON public.signal_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "signal_subscriptions owner insert" ON public.signal_subscriptions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "signal_subscriptions owner update" ON public.signal_subscriptions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "signal_subscriptions owner delete" ON public.signal_subscriptions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER trg_signal_subscriptions_updated_at
  BEFORE UPDATE ON public.signal_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- RISK_AUDIT ----------
CREATE TABLE public.risk_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  symbol TEXT,
  risk_score NUMERIC,
  allowed BOOLEAN NOT NULL,
  reason TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_risk_audit_user_time ON public.risk_audit (user_id, created_at DESC);
GRANT SELECT ON public.risk_audit TO authenticated;
GRANT ALL ON public.risk_audit TO service_role;
ALTER TABLE public.risk_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "risk_audit owner select" ON public.risk_audit FOR SELECT TO authenticated USING (auth.uid() = user_id);
