DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND has_table_privilege('anon', c.oid, 'SELECT')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = c.relname
          AND 'anon' = ANY(p.roles) AND p.cmd IN ('SELECT','ALL')
      )
  LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM anon', r.relname);
  END LOOP;
END $$;