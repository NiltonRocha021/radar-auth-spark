\set ON_ERROR_STOP off
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'

select set_config('request.jwt.claim.sub', :'A', false);
set role authenticated;

\echo '--- T1 escrita direta do cliente (esperado: permission denied em todas)'
insert into public.subscribers(user_id,note) values (:'A','x');
update public.subscribers set note='y' where user_id=:'A';
delete from public.subscribers where user_id=:'A';
insert into public.subscriber_executions(user_id,note) values (:'A','x');
delete from public.subscriber_executions where user_id=:'A';
insert into public.binance_order_validations(user_id,status) values (:'A','VALIDATED');
update public.binance_order_validations set status='VALIDATED' where user_id=:'A';
delete from public.binance_order_validations where user_id=:'A';

\echo '--- T2 SELECT do dono continua'
select 'subscribers' t, count(*) from public.subscribers where user_id=:'A'
union all
select 'validations', count(*) from public.binance_order_validations where user_id=:'A';

\echo '--- T3 profiles.email (esperado: sempre alice@real.com)'
insert into public.profiles(id,email,full_name)
values (:'A','spoof@evil.com','Alice');
select email from public.profiles where id=:'A';
update public.profiles set email='spoof2@evil.com' where id=:'A';
select email from public.profiles where id=:'A';
update public.profiles set full_name='Alice B' where id=:'A';
select full_name, email from public.profiles where id=:'A';

\echo '--- T4 usuario sem e-mail no Auth mantém o valor recebido'
select set_config('request.jwt.claim.sub', :'B', false);
insert into public.profiles(id,email) values (:'B','phone@x.com');
select email from public.profiles where id=:'B';

\echo '--- T5 authenticated não executa a função diretamente'
select public.profiles_force_auth_email();

reset role;

\echo '--- T6 service_role grava validações'
set role service_role;
insert into public.binance_order_validations(user_id,status)
values (:'A','VALIDATED');

\echo '--- T7 rate limit server-side'
select public.check_rate_limit_by_key('test:user-a','test.action',2,60);
select public.check_rate_limit_by_key('test:user-a','test.action',2,60);
select public.check_rate_limit_by_key('test:user-a','test.action',2,60);
reset role;
