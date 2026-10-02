\set ON_ERROR_STOP on
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

begin;

\echo '--- fixtures (superuser)'
select set_config('t.a', :'A', false) as _a, set_config('t.b', :'B', false) as _b \gset

insert into auth.users (id, email) values (:'A', 'alice@real.com'), (:'B', null)
on conflict (id) do update set email = excluded.email;

delete from public.profiles where id in (:'A', :'B');
delete from public.subscribers where user_id in (:'A', :'B');
delete from public.binance_order_validations where user_id in (:'A', :'B');
delete from public.rate_limits_by_key where key = 'regression:' || :'A';

insert into public.subscribers (user_id, name, channel, target)
values (:'A', 'fixture', 'email', 'a@x.com');
insert into public.binance_order_validations
  (user_id, symbol, side, order_type, quantity, status, environment)
values (:'A', 'BTCUSDT', 'BUY', 'MARKET', 1, 'VALIDATED', 'TESTNET');

select set_config('request.jwt.claim.sub', :'A', false) as _s \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'A', 'role', 'authenticated')::text, false) as _c \gset
set role authenticated;

\echo '--- T1 privilégios: cliente não escreve em tabelas de execução'
DO $$
begin
  if has_table_privilege('authenticated', 'public.subscribers', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscribers', 'UPDATE')
     or has_table_privilege('authenticated', 'public.subscribers', 'DELETE')
     or has_table_privilege('authenticated', 'public.subscriber_executions', 'INSERT')
     or has_table_privilege('authenticated', 'public.subscriber_executions', 'UPDATE')
     or has_table_privilege('authenticated', 'public.subscriber_executions', 'DELETE')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'INSERT')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'UPDATE')
     or has_table_privilege('authenticated', 'public.binance_order_validations', 'DELETE')
  then
    raise exception 'authenticated ainda tem escrita direta em tabelas de execução';
  end if;
end $$;

\echo '--- T2 leitura continua escopada ao dono'
DO $$
declare v_sub int; v_val int;
begin
  select count(*) into v_sub from public.subscribers where user_id = current_setting('t.a')::uuid;
  select count(*) into v_val from public.binance_order_validations where user_id = current_setting('t.a')::uuid;
  if v_sub <> 1 or v_val <> 1 then
    raise exception 'contagem inesperada para o dono: subscribers=%, validations=%', v_sub, v_val;
  end if;
end $$;

\echo '--- T3 profiles.email canônico (auth.users)'
insert into public.profiles (id, email, full_name) values (:'A', 'spoof@evil.com', 'Alice');
DO $$
declare v text;
begin
  select email into v from public.profiles where id = current_setting('t.a')::uuid;
  if v is distinct from 'alice@real.com' then raise exception 'email nao canonicalizado no INSERT: %', v; end if;
end $$;

update public.profiles set email = 'spoof2@evil.com' where id = :'A';
DO $$
declare v text;
begin
  select email into v from public.profiles where id = current_setting('t.a')::uuid;
  if v is distinct from 'alice@real.com' then raise exception 'email nao canonicalizado no UPDATE: %', v; end if;
end $$;

update public.profiles set full_name = 'Alice B' where id = :'A';
DO $$
declare v text;
begin
  select email into v from public.profiles where id = current_setting('t.a')::uuid;
  if v is distinct from 'alice@real.com' then raise exception 'email mudou em UPDATE nao relacionado: %', v; end if;
end $$;

\echo '--- T4 usuário B (sem e-mail no Auth) mantém o e-mail enviado; e não enxerga dados de A'
select set_config('request.jwt.claim.sub', :'B', false) as _s \gset
select set_config('request.jwt.claims',
  json_build_object('sub', :'B', 'role', 'authenticated')::text, false) as _c \gset
insert into public.profiles (id, email) values (:'B', 'phone@x.com');
DO $$
declare v text; n int;
begin
  select email into v from public.profiles where id = current_setting('t.b')::uuid;
  if v is distinct from 'phone@x.com' then raise exception 'fallback de e-mail falhou: %', v; end if;
  select count(*) into n from public.subscribers where user_id = current_setting('t.a')::uuid;
  if n <> 0 then raise exception 'B enxerga subscribers de A: %', n; end if;
  select count(*) into n from public.binance_order_validations where user_id = current_setting('t.a')::uuid;
  if n <> 0 then raise exception 'B enxerga validations de A: %', n; end if;
end $$;

\echo '--- T5 authenticated não executa a função do trigger'
DO $$
begin
  if has_function_privilege('authenticated', 'public.profiles_force_auth_email()', 'EXECUTE') then
    raise exception 'authenticated executa profiles_force_auth_email()';
  end if;
end $$;

\echo '--- T6 colunas server-owned de profiles não são atualizáveis pelo cliente'
DO $$
declare c text;
begin
  foreach c in array array['operations_today','drawdown_today','recent_losses','open_loss_pct',
    'dna_updated_at','dna_consistency','dna_discipline','dna_risk_control','dna_timing',
    'dna_emotional_control','worst_session','updated_at']
  loop
    if has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE') then
      raise exception 'authenticated ainda pode UPDATE em profiles.%', c;
    end if;
  end loop;
  if not has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE') then
    raise exception 'authenticated perdeu UPDATE legítimo em profiles.full_name';
  end if;
end $$;

reset role;

\echo '--- T7 service_role continua escrevendo nas tabelas de execução'
set role service_role;
insert into public.binance_order_validations
  (user_id, symbol, side, order_type, quantity, status, environment, message)
values (:'A', 'ETHUSDT', 'SELL', 'MARKET', 1, 'VALIDATED', 'TESTNET', 'service_role_fixture');
DO $$
begin
  if not exists (select 1 from public.binance_order_validations where message = 'service_role_fixture') then
    raise exception 'insert do service_role nao persistiu';
  end if;
end $$;

\echo '--- T8 rate limiter: 1ª true, 2ª true, 3ª false; privilégios de EXECUTE'
DO $$
declare r1 boolean; r2 boolean; r3 boolean; k text := 'regression:' || current_setting('t.a');
begin
  if not has_function_privilege('service_role', 'public.check_rate_limit_by_key(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'service_role nao executa check_rate_limit_by_key';
  end if;
  if has_function_privilege('authenticated', 'public.check_rate_limit_by_key(text,text,integer,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'public.check_rate_limit_by_key(text,text,integer,integer)', 'EXECUTE') then
    raise exception 'anon/authenticated executam check_rate_limit_by_key';
  end if;
  r1 := public.check_rate_limit_by_key(k, 'test.action', 2, 3600);
  r2 := public.check_rate_limit_by_key(k, 'test.action', 2, 3600);
  r3 := public.check_rate_limit_by_key(k, 'test.action', 2, 3600);
  if r1 is not true or r2 is not true or r3 is not false then
    raise exception 'sequencia inesperada do rate limit: %, %, %', r1, r2, r3;
  end if;
end $$;

reset role;
\echo 'OK: todos os testes passaram'
rollback;
