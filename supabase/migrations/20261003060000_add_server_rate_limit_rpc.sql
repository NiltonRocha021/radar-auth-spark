-- Server-side rate limiting for privileged mutations.
-- The existing rate_limits_by_key table is used because server-side calls
-- authenticate as service_role and therefore cannot rely on auth.uid().
--
-- The RPC is executable only by service_role. It performs the counter update
-- atomically so concurrent requests cannot bypass the limit.

revoke all on table public.rate_limits_by_key from public, anon, authenticated;
grant all on table public.rate_limits_by_key to service_role;

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

  insert into public.rate_limits_by_key (
    key,
    action,
    window_start,
    count
  )
  values (
    p_key,
    p_action,
    v_now,
    1
  )
  on conflict (key, action) do update
  set
    window_start = case
      when public.rate_limits_by_key.window_start
        <= v_now - (p_window_seconds * interval '1 second')
      then v_now
      else public.rate_limits_by_key.window_start
    end,
    count = case
      when public.rate_limits_by_key.window_start
        <= v_now - (p_window_seconds * interval '1 second')
      then 1
      else public.rate_limits_by_key.count + 1
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$$;

revoke execute on function public.check_rate_limit_by_key(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit_by_key(text, text, integer, integer)
  to service_role;
