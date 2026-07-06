-- Add owner-scoped SELECT policy so users can see their own dispatch entries.
-- Writes remain restricted to service_role (which bypasses RLS).
CREATE POLICY "Users can view their own dispatch entries"
  ON public.alert_dispatch_queue
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.alert_dispatch_queue TO authenticated;
GRANT ALL ON public.alert_dispatch_queue TO service_role;