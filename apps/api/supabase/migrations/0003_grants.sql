-- ============================================================================
-- 0003_grants.sql — table privileges (works together with 0002 RLS)
--
-- RLS gates WHICH rows a role can see; GRANTs gate whether the role has table
-- access at all. We give anon/authenticated SELECT-only on catalog tables (rows
-- still filtered by the RLS policies), and NO write privileges — every mutation
-- goes through Express with the service-role key. `service_role` already has
-- full access and bypasses RLS, so it needs nothing here.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- Read-only catalog access for the public roles (RLS still applies per-row).
grant select on
  public.brands,
  public.categories,
  public.products,
  public.product_images,
  public.product_specs,
  public.product_highlights
to anon, authenticated;

-- A signed-in user may read their own profile row (gated by RLS).
grant select on public.profiles to authenticated;

-- Explicitly deny write privileges to the public roles (defensive; these are
-- not granted above, but revoke makes the intent unambiguous).
revoke insert, update, delete on
  public.brands,
  public.categories,
  public.products,
  public.product_images,
  public.product_specs,
  public.product_highlights,
  public.profiles
from anon, authenticated;
