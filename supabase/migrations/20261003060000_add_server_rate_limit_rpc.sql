-- Server-side rate limiting for privileged mutations.
-- Called only through the service_role-backed server client.
--
-- This deliberately uses an explicit key instead of auth.uid(), because
-- service_role requests do not carry the end-user JWT subject.

create table if not exists public.rate_limit_buckets (
  key text not null,
  action text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null,
  primary key (key, action),
  constraint rate_limit_buckets_attempt_count_positive
    check (attempt_count > 0)
);

revoke all on table public.rate_limit_buckets from public, anon, authenticated;
grant all on table public.rate_limit_buckets to service_role;

create or replace function public.check_rate_limit_by_key(
  p_key text,
  p_action text,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if p_key is null or btrim(p_key) = ''
     or p_action is null or btrim(p_action) = ''
     or p_max <= 0
     or p_window_seconds <= 0 then
    raise exception 'Invalid rate limit parameters'
      using errcode = '22023';
  end if;

  insert into public.rate_limit_buckets (
    key,
    action,
    window_started_at,
    attempt_count
  )
  values (
    p_key,
    p_action,
    v_now,
    1
  )
  on conflict (key, action) do update
  set
    window_started_at = case
      when public.rate_limit_buckets.window_started_at
        <= v_now - (p_window_seconds * interval '1 second')
      then v_now
      else public.rate_limit_buckets.window_started_at
    end,
    attempt_count = case
      when public.rate_limit_buckets.window_started_at
        <= v_now - (p_window_seconds * interval '1 second')
      then 1
      else public.rate_limit_buckets.attempt_count + 1
    end
  returning attempt_count into v_count;

  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit_by_key(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit_by_key(text, text, integer, integer)
  to service_role;
