-- ============================================================================
-- 0002_rls.sql — Row Level Security (defense-in-depth)
--
-- Enable RLS on EVERY table with deny-by-default. The API talks to Postgres with
-- the service-role key, which BYPASSES RLS, so these policies are purely a
-- safety net: if an anon/authenticated key ever reaches the DB directly, it can
-- read only published catalog rows and nothing else. No write policies exist for
-- anon/authenticated — all writes go through Express (service role).
--
-- Idempotent: policies are dropped-then-created. Safe to re-run.
-- ============================================================================

alter table public.profiles           enable row level security;
alter table public.brands             enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.product_images     enable row level security;
alter table public.product_specs      enable row level security;
alter table public.product_highlights enable row level security;

-- --- profiles: a user may read only their own profile ----------------------
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (auth.uid() = id);

-- --- brands: public read (facet data, no publish flag) ---------------------
drop policy if exists brands_select_public on public.brands;
create policy brands_select_public on public.brands
  for select using (true);

-- --- categories: public read of published rows -----------------------------
drop policy if exists categories_select_published on public.categories;
create policy categories_select_published on public.categories
  for select using (is_published);

-- --- products: public read of published rows -------------------------------
drop policy if exists products_select_published on public.products;
create policy products_select_published on public.products
  for select using (is_published);

-- --- child tables: readable only when the parent product is published ------
drop policy if exists product_images_select_published on public.product_images;
create policy product_images_select_published on public.product_images
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_images.product_id and p.is_published
    )
  );

drop policy if exists product_specs_select_published on public.product_specs;
create policy product_specs_select_published on public.product_specs
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_specs.product_id and p.is_published
    )
  );

drop policy if exists product_highlights_select_published on public.product_highlights;
create policy product_highlights_select_published on public.product_highlights
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_highlights.product_id and p.is_published
    )
  );
