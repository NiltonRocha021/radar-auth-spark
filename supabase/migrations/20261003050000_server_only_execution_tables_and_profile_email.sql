-- Follow-up hardening: privileged execution writes are server-only.
revoke insert, update, delete on public.subscribers from authenticated;
drop policy if exists "subscribers owner insert" on public.subscribers;
drop policy if exists "subscribers owner update" on public.subscribers;
drop policy if exists "subscribers owner delete" on public.subscribers;

revoke insert, update, delete on public.subscriber_executions from authenticated;
drop policy if exists "subscriber_executions owner insert" on public.subscriber_executions;
drop policy if exists "subscriber_executions owner delete" on public.subscriber_executions;

revoke insert, update, delete on public.binance_order_validations from authenticated;
drop policy if exists "Users can create own Binance order validations"
  on public.binance_order_validations;

-- Keep profiles.email aligned with auth.users when the profile row is written.
-- SECURITY DEFINER is restricted to trigger execution and uses a minimal search_path.
create or replace function public.profiles_force_auth_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_auth_email text;
begin
  select u.email into v_auth_email
  from auth.users as u
  where u.id = new.id;

  new.email := coalesce(v_auth_email, new.email);
  return new;
end;
$$;

revoke execute on function public.profiles_force_auth_email() from public, anon, authenticated;

drop trigger if exists profiles_force_auth_email on public.profiles;
create trigger profiles_force_auth_email
  before insert or update of email on public.profiles
  for each row execute function public.profiles_force_auth_email();
