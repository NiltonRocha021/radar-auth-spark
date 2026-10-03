-- Follow-up hardening: preserve migration history and revoke only the
-- client updates that are now server-owned.
revoke update (
  operations_today,
  drawdown_today,
  recent_losses,
  open_loss_pct,
  dna_updated_at,
  dna_consistency,
  dna_discipline,
  dna_risk_control,
  dna_timing,
  dna_emotional_control,
  worst_session,
  updated_at
) on public.profiles from authenticated;
