-- Restrict client writes on profiles to fields used by the authenticated app.
-- Billing-controlled/profile-system fields remain writable only by backend triggers/service_role.
--
-- IMPORTANT:
-- - Keep the existing owner-scoped INSERT/UPDATE policies.
-- - plan_tier is protected by profiles_prevent_plan_tier_escalation,
--   but column grants provide the intended privilege boundary as well.
-- - INSERT omits billing/system-managed columns so first-row creation still
--   receives their database defaults.
-- - UPDATE includes fields currently written by profile/onboarding/DNA/notification flows.

REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;

GRANT INSERT (
  id,
  email,
  full_name,
  experience,
  markets,
  goal,
  onboarding_completed,
  username,
  phone_country,
  phone,
  country,
  timezone,
  bio,
  website
) ON public.profiles TO authenticated;

GRANT UPDATE (
  id,
  email,
  full_name,
  experience,
  markets,
  goal,
  onboarding_completed,
  username,
  phone_country,
  phone,
  country,
  timezone,
  bio,
  website,
) ON public.profiles TO authenticated;
