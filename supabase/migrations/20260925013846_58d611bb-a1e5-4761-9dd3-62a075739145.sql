CREATE TABLE public.binance_order_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL DEFAULT 'LIVE',
  symbol text NOT NULL,
  side text NOT NULL,
  order_type text NOT NULL,
  quantity numeric NOT NULL,
  price numeric,
  status text NOT NULL,
  environment text NOT NULL,
  message text,
  validated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.binance_order_validations TO authenticated;
GRANT ALL ON public.binance_order_validations TO service_role;

ALTER TABLE public.binance_order_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own Binance order validations"
ON public.binance_order_validations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own Binance order validations"
ON public.binance_order_validations
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX binance_order_validations_user_validated_idx
ON public.binance_order_validations (user_id, validated_at DESC);