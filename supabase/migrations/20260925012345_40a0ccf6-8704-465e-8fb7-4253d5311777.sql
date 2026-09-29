ALTER TABLE public.bot4x_configs
  ADD COLUMN IF NOT EXISTS execution_mode text NOT NULL DEFAULT 'DEMO';

ALTER TABLE public.bot4x_configs
  DROP CONSTRAINT IF EXISTS bot4x_configs_execution_mode_check;

ALTER TABLE public.bot4x_configs
  ADD CONSTRAINT bot4x_configs_execution_mode_check
  CHECK (execution_mode IN ('DEMO', 'LIVE'));

CREATE TABLE public.binance_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key_ciphertext text NOT NULL,
  api_key_iv text NOT NULL,
  api_secret_ciphertext text NOT NULL,
  api_secret_iv text NOT NULL,
  key_suffix text NOT NULL CHECK (char_length(key_suffix) = 4),
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('testnet', 'production')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'valid', 'invalid', 'revoked')),
  last_validated_at timestamptz,
  last_validation_error text,
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.binance_credentials TO service_role;

ALTER TABLE public.binance_credentials ENABLE ROW LEVEL SECURITY;

CREATE INDEX binance_credentials_status_idx
  ON public.binance_credentials (status, updated_at DESC);

CREATE TRIGGER set_binance_credentials_updated_at
  BEFORE UPDATE ON public.binance_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();