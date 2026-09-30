DROP POLICY IF EXISTS "authenticated can read trading safety state" ON public.trading_safety_state;

CREATE POLICY "admins can read trading safety state"
ON public.trading_safety_state
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));