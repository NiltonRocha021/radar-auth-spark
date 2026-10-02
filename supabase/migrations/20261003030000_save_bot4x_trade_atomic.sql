-- Atomically persist a Bot4x trade and, when requested, its outbox record.
-- The RPC is server-only: authenticated clients must never be able to supply
-- an arbitrary p_user_id and bypass ownership checks.
--
-- SECURITY INVOKER is intentional. The application calls this RPC through the
-- service-role client, so it already has the required table privileges without
-- introducing SECURITY DEFINER privilege escalation.

create or replace function public.save_bot4x_trade(
  p_user_id uuid,
  p_id text,
  p_day date,
  p_pair text,
  p_side text,
  p_entry numeric,
  p_stop numeric,
  p_target numeric,
  p_result text,
  p_pnl numeric,
  p_pnl_pct numeric,
  p_accumulated numeric,
  p_profile text,
  p_leverage integer,
  p_motivo text,
  p_hour integer,
  p_with_outbox boolean default false,
  p_trade_data jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.bot4x_trades as t (
    id,
    user_id,
    day,
    pair,
    side,
    entry,
    stop,
    target,
    result,
    pnl,
    pnl_pct,
    accumulated,
    profile,
    leverage,
    motivo,
    hour
  )
  values (
    p_id,
    p_user_id,
    p_day,
    p_pair,
    p_side,
    p_entry,
    p_stop,
    p_target,
    p_result,
    p_pnl,
    p_pnl_pct,
    p_accumulated,
    p_profile,
    p_leverage,
    p_motivo,
    p_hour
  )
  on conflict (id) do update
  set
    day = excluded.day,
    pair = excluded.pair,
    side = excluded.side,
    entry = excluded.entry,
    stop = excluded.stop,
    target = excluded.target,
    result = excluded.result,
    pnl = excluded.pnl,
    pnl_pct = excluded.pnl_pct,
    accumulated = excluded.accumulated,
    profile = excluded.profile,
    leverage = excluded.leverage,
    motivo = excluded.motivo,
    hour = excluded.hour
  where t.user_id = excluded.user_id;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'Trade ownership conflict';
  end if;

  if p_with_outbox then
    insert into public.trade_outbox (
      user_id,
      trade_data,
      status,
      processed_at
    )
    values (
      p_user_id,
      coalesce(p_trade_data, '{}'::jsonb),
      'processed',
      now()
    );
  end if;
end;
$$;

revoke all on function public.save_bot4x_trade(
  uuid,
  text,
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text,
  integer,
  text,
  integer,
  boolean,
  jsonb
) from public, anon, authenticated;

grant execute on function public.save_bot4x_trade(
  uuid,
  text,
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  text,
  numeric,
  numeric,
  numeric,
  text,
  integer,
  text,
  integer,
  boolean,
  jsonb
) to service_role;
