DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', r.tablename);
    IF EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tablename
        AND (p.roles = '{public}'::name[] OR 'authenticated' = ANY(p.roles))
    ) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', r.tablename);
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.tablename = r.tablename
        AND (p.roles = '{public}'::name[] OR 'anon' = ANY(p.roles))
        AND p.cmd IN ('SELECT','ALL')
    ) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', r.tablename);
    END IF;
  END LOOP;
END $$;