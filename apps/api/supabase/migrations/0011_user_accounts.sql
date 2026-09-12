-- ============================================================================
-- 0011_user_accounts.sql — customer accounts (signup + order history)
--
-- Phase 1 shipped an admin-only auth surface and pure guest orders. This
-- migration is the whole database side of customer accounts, and it is small on
-- purpose: `profiles` already carries the two-value `role` enum, `is_active`,
-- and the `on_auth_user_created` trigger that auto-creates a 'customer' profile,
-- so self-signup and admin-created accounts both land in the existing shape.
-- The only new column anywhere is `orders.user_id`.
--
-- `user_id` is NULLABLE and ON DELETE SET NULL, deliberately:
--   * guest checkout keeps working exactly as before (NULL user_id), and
--   * deleting an account must never erase order history — same reasoning as
--     `order_items.product_id` in 0006.
--
-- Run by hand in the Supabase SQL Editor, after 0010. Idempotent: re-runnable.
-- ============================================================================

-- --- 1. Link orders to an account ------------------------------------------
alter table public.orders
  add column if not exists user_id uuid references public.profiles (id) on delete set null;

create index if not exists orders_user_id_idx on public.orders (user_id);

-- --- 2. RLS: a signed-in user may read their OWN orders ---------------------
-- Defense-in-depth only. The API reads orders with the service-role key (which
-- bypasses RLS) and scopes by user_id itself in modules/account. These policies
-- exist so that if an anon/authenticated key ever reached Postgres directly it
-- could still only see that user's own rows.
--
-- 0006 created NO policies on these tables at all (RLS on + zero policies =
-- nothing visible to anyone but service_role). These two are the first, and
-- they stay SELECT-only: every write still goes through Express.
drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id);

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select using (
    exists (
      select 1 from public.orders o
      where o.id = order_items.order_id and o.user_id = auth.uid()
    )
  );

-- --- 3. Grants --------------------------------------------------------------
-- 0006 revoked everything from anon and authenticated. Narrow that to SELECT
-- for `authenticated` only, which the policies above then restrict to the
-- caller's own rows. `anon` deliberately keeps nothing: a guest order is not
-- readable by anyone but the shop.
grant select on public.orders, public.order_items to authenticated;
