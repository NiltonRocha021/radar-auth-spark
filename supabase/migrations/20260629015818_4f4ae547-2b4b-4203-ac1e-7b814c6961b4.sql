
-- Revoke EXECUTE from anon/authenticated on SECURITY DEFINER functions that should
-- only be invoked by triggers, service_role, or backend cron — not by signed-in users
-- via PostgREST/Data API.

-- Trigger-only functions (fired by Postgres triggers, never called directly by clients)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_copilot_history_expires_at() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_plan_tier_self_escalation() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_daily_dna_metrics() FROM anon, authenticated, PUBLIC;

-- Email queue plumbing — service_role / backend cron only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;

-- Keyed rate-limiter (IP/api-key scoped) — backend only
REVOKE EXECUTE ON FUNCTION public.check_rate_limit_by_key(text, text, integer, integer) FROM anon, authenticated, PUBLIC;

-- Maintenance / cleanup — backend cron only
REVOKE EXECUTE ON FUNCTION public.cleanup_rate_limits() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_user_notifications(integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.purge_expired_copilot_history() FROM anon, authenticated, PUBLIC;

-- Note: public.has_role(uuid, app_role) and public.check_rate_limit(uuid, text, integer)
-- intentionally remain executable by authenticated — has_role is used inside RLS
-- policies, and check_rate_limit enforces auth.uid() == p_user_id internally.
