
-- ============================================================
-- alert_preferences
-- ============================================================
CREATE TABLE public.alert_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- channels: { telegram: {enabled, chat_id}, email: {enabled, address}, discord: {enabled, webhook_url} }
  channels JSONB NOT NULL DEFAULT '{
    "telegram": {"enabled": false, "chat_id": null},
    "email":    {"enabled": true,  "address": null},
    "discord":  {"enabled": false, "webhook_url": null}
  }'::jsonb,

  -- quiet_hours: { enabled, start: "22:00", end: "07:00", timezone: "UTC" }
  quiet_hours JSONB NOT NULL DEFAULT '{
    "enabled": false, "start": "22:00", "end": "07:00", "timezone": "UTC"
  }'::jsonb,

  -- thresholds: { min_confidence, symbols: [], severities: [], sources: [] }
  thresholds JSONB NOT NULL DEFAULT '{
    "min_confidence": 70,
    "symbols": [],
    "severities": ["info","warning","critical"],
    "sources":    ["signal","trade","system"]
  }'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_preferences TO authenticated;
GRANT ALL ON public.alert_preferences TO service_role;

ALTER TABLE public.alert_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_prefs_select_own"
  ON public.alert_preferences FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "alert_prefs_insert_own"
  ON public.alert_preferences FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_prefs_update_own"
  ON public.alert_preferences FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alert_prefs_delete_own"
  ON public.alert_preferences FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER alert_prefs_set_updated_at
  BEFORE UPDATE ON public.alert_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- alert_events (feed)
-- ============================================================
CREATE TYPE public.alert_source AS ENUM ('signal','trade','system');
CREATE TYPE public.alert_severity AS ENUM ('info','warning','critical');

CREATE TABLE public.alert_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  source     public.alert_source   NOT NULL,
  severity   public.alert_severity NOT NULL DEFAULT 'info',
  kind       TEXT NOT NULL,             -- 'signal_buy','signal_sell','trade_opened','trade_closed','tp_hit','sl_hit','bot_paused','api_error', etc.
  symbol     TEXT,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- reference to source row (nullable)
  signal_id      UUID REFERENCES public.signals(id) ON DELETE SET NULL,
  trade_outbox_id UUID REFERENCES public.trade_outbox(id) ON DELETE SET NULL,

  read_at        TIMESTAMPTZ,
  dispatch_state JSONB NOT NULL DEFAULT '{
    "telegram": "pending", "email": "pending", "discord": "pending"
  }'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, UPDATE ON public.alert_events TO authenticated;
GRANT ALL ON public.alert_events TO service_role;

ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

-- users can read their own events
CREATE POLICY "alert_events_select_own"
  ON public.alert_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- users can update ONLY read_at on their own events (rely on server to enforce field)
CREATE POLICY "alert_events_update_own"
  ON public.alert_events FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- no INSERT / DELETE for authenticated: only service_role can create/delete events.

CREATE INDEX alert_events_user_created_idx
  ON public.alert_events (user_id, created_at DESC);

CREATE INDEX alert_events_user_unread_idx
  ON public.alert_events (user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TRIGGER alert_events_set_updated_at
  BEFORE UPDATE ON public.alert_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- alert_dispatch_queue (internal — service_role only)
-- ============================================================
CREATE TABLE public.alert_dispatch_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.alert_events(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel  TEXT NOT NULL CHECK (channel IN ('telegram','email','discord')),
  status   TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- no grants to anon / authenticated on purpose
GRANT ALL ON public.alert_dispatch_queue TO service_role;

ALTER TABLE public.alert_dispatch_queue ENABLE ROW LEVEL SECURITY;
-- no policies -> authenticated cannot touch it (service_role bypasses RLS)

CREATE INDEX alert_dispatch_pending_idx
  ON public.alert_dispatch_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE TRIGGER alert_dispatch_set_updated_at
  BEFORE UPDATE ON public.alert_dispatch_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
