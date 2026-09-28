DROP POLICY IF EXISTS "manipulation_alerts read for authenticated" ON public.manipulation_alerts;
CREATE POLICY "manipulation_alerts read for admins"
ON public.manipulation_alerts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

REVOKE INSERT, UPDATE, DELETE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.api_keys FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.binance_order_validations FROM authenticated;

CREATE TABLE public.trading_safety_state (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  live_trading_enabled boolean NOT NULL DEFAULT false,
  reason text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.trading_safety_state TO authenticated;
GRANT ALL ON public.trading_safety_state TO service_role;
ALTER TABLE public.trading_safety_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can read trading safety state"
ON public.trading_safety_state
FOR SELECT
TO authenticated
USING (true);
INSERT INTO public.trading_safety_state (id, live_trading_enabled, reason)
VALUES (true, false, 'Operações reais bloqueadas até validação administrativa');