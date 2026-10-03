-- Harden user_two_factor so clients can only read the minimal
-- non-secret state needed by the application. All writes and secret reads
-- are performed by server-side functions through service_role.
--
-- The table remains protected by RLS; these grants are an additional
-- privilege boundary and do not expose the TOTP secret or backup codes.

revoke insert, update, delete on table public.user_two_factor from authenticated;
revoke select on table public.user_two_factor from authenticated;

grant select (user_id, enabled, enabled_at)
  on table public.user_two_factor
  to authenticated;
