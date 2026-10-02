\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

\echo '--- T1 privileges: client cannot write execution tables'
DO $$
begin
  if has_table_privilege('authenticated', 'public.subscribers', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscribers', 'UPDATE')
     or has_table_privilege('authenticated', 'public.subscribers', 'DELETE')
     or has_table_privilege('authenticated', 'public.subscriber_executions', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscriber_executions', 'DELETE')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'INSERT')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'DELETE')
  then
    raise exception 'authenticated still has direct write privileges on execution tables';
  end if;
end $$;

\echo '--- T2 reads remain owner-scoped'
DO $$
declare
  v_subscribers integer;
  v_validations integer;
begin
  select count(*) into v_subscribers
    from public.subscribers where user_id = :'A';
  select count(*) into v_validations
    from public.binance_order_validations where user_id = :'A';

  if v_subscribers <> 1 or v_validations <> 1 then
    raise exception 'unexpected owner row counts: subscribers=%, validations=%',
      v_subscribers, v_validations;
  end if;
end $$;

\echo '--- T3 profiles.email is canonicalized from auth.users'
insert into public.profiles(id,email,full_name)
values (:'A','spoof@evil.com','Alice');

DO $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = :'A';
  if v_email <> 'alice@real.com' then
    raise exception 'profiles.email was not canonicalized on insert: %', v_email;
  end if;
end $$;

update public.profiles set email='spoof2@evil.com' where id=:'A';

DO $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = :'A';
  if v_email <> 'alice@real.com' then
    raise exception 'profiles.email was not canonicalized on update: %', v_email;
  end if;
end $$;

update public.profiles set full_name='Alice B' where id=:'A';

DO $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = :'A';
  if v_email <> 'alice@real.com' then
    raise exception 'profiles.email changed during unrelated update: %', v_email;
  end if;
end $$;

\echo '--- T4 user without Auth email keeps submitted email'
select set_config('request.jwt.claim.sub', :'B', false);
insert into public.profiles(id,email) values (:'B','phone@x.com');

DO $$
declare v_email text;
begin
  select email into v_email from public.profiles where id = :'B';
  if v_email <> 'phone@x.com' then
    raise exception 'profiles.email fallback failed: %', v_email;
  end if;
end $$;

\echo '--- T5 authenticated cannot execute trigger function directly'
DO $$
begin
  if has_function_privilege(
    'authenticated',
    'public.profiles_force_auth_email()',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute profiles_force_auth_email()';
  end if;
end $$;

reset role;

\echo '--- T6 service_role retains execution writes'
set role service_role;
insert into public.binance_order_validations(user_id,status)
values (:'A','VALIDATED');

DO $$
begin
  if not exists (
    select 1
    from public.binance_order_validations
    where user_id = :'A'
      and status = 'VALIDATED'
  ) then
    raise exception 'service_role validation insert was not persisted';
  end if;
end $$;

\echo '--- T7 rate limit RPC: allowed through limit, denied after limit'
DO $$
declare
  v1 boolean;
  v2 boolean;
  v3 boolean;
begin
  if not has_function_privilege(
    'service_role',
    'public.check_rate_limit_by_key(text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'service_role cannot execute check_rate_limit_by_key';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.check_rate_limit_by_key(text,text,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'authenticated can execute check_rate_limit_by_key';
  end if;
end $$;

select public.check_rate_limit_by_key(
  'regression:' || :'A',
  'test.action',
  2,
  60
) as first_attempt \gset rate_

select public.check_rate_limit_by_key(
  'regression:' || :'A',
  'test.action',
  2,
  60
) as second_attempt \gset rate_

select public.check_rate_limit_by_key(
  'regression:' || :'A',
  'test.action',
  2,
  60
) as third_attempt \gset rate_

DO $$
begin
  if :'rate_first_attempt'::boolean is not true
     or :'rate_second_attempt'::boolean is not true
     or :'rate_third_attempt'::boolean is not false then
    raise exception 'unexpected rate-limit sequence: %, %, %',
      :'rate_first_attempt', :'rate_second_attempt', :'rate_third_attempt';
  end if;
end $$;

reset role;
