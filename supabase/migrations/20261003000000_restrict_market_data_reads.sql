-- Restrict market-data tables to authenticated application users.
-- These tables contain market data, but they are not intended to be anonymously readable
-- through Supabase PostgREST. Public Binance data is fetched directly from Binance instead.

drop policy if exists "symbol_sequencer is public read" on public.symbol_sequencer;
create policy "symbol_sequencer authenticated read"
  on public.symbol_sequencer
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "market_ohlcv is public read" on public.market_ohlcv;
create policy "market_ohlcv authenticated read"
  on public.market_ohlcv
  for select
  to authenticated
  using (auth.uid() is not null);

drop policy if exists "market_snapshot is public read" on public.market_snapshot;
create policy "market_snapshot authenticated read"
  on public.market_snapshot
  for select
  to authenticated
  using (auth.uid() is not null);
