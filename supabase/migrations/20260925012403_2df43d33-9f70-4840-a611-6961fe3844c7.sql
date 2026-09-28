CREATE POLICY "Service role manages Binance credentials"
ON public.binance_credentials
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);