-- ============================================================================
-- 0010_homepage_content.sql — admin-editable homepage + store locations
--
-- The homepage was entirely hardcoded in apps/web/src/pages/HomePage.tsx, and
-- the two cards beside the hero rendered `categoryList[0]` and `[1]` — so the
-- "In stock now" image was whatever photo happened to sit on the second
-- top-level category, and changing a category's sort_order silently changed the
-- homepage. That borrowing is the bug; giving each block its own rows is the fix.
--
-- Bilingual from birth: every admin-typed column has the `_es` sibling
-- convention established by 0009 (nullable, no default, NULL = falls back to
-- English). Addresses are NOT translated.
--
-- Run by hand in the Supabase SQL Editor, after 0009. Re-runnable.
-- ============================================================================

-- --- 1. Hero ---------------------------------------------------------------
-- A singleton row, structurally enforced by `id boolean primary key check (id)`
-- — not a key/value settings table. The hero has a fixed designed shape (it is
-- a Stitch screen, not user-extensible config); a KV table would return
-- {key,value}[], force a runtime reduce, defeat `not null` (nothing would
-- guarantee a headline exists) and leave no compile-time DTO. The singleton
-- also makes the admin write a one-liner: insert ... on conflict (id) do update.
create table if not exists public.home_hero (
  id          boolean primary key default true,
  constraint home_hero_singleton check (id),
  image_url   text,
  eyebrow     text,
  eyebrow_es  text,
  headline    text not null,
  headline_es text,
  subcopy     text,
  subcopy_es  text,
  cta_label   text,
  cta_label_es text,
  cta_href    text not null default '/shop',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_home_hero_updated_at on public.home_hero;
create trigger trg_home_hero_updated_at
  before update on public.home_hero
  for each row execute function public.set_updated_at();


-- --- 2. Tiles --------------------------------------------------------------
-- Three slots, ONE table — they differ only in where they render:
--   'promo'   the two image cards beside the hero (own image_url + href now,
--             instead of borrowing a category's photo)
--   'service' the icon-only trust row
--   'ticker'  the marquee strip (title only)
-- Including the ticker costs nothing and removes the last hardcoded copy array
-- from the homepage.
--
-- Deliberately NO cross-column check like `slot <> 'promo' or image_url is not
-- null`: the admin flow is create row -> upload -> PATCH image_url (same as
-- products), so such a check would make a promo tile impossible to create.
-- ImageWithFallback already degrades to a placeholder.
create table if not exists public.home_tiles (
  id           uuid primary key default gen_random_uuid(),
  slot         text not null check (slot in ('promo', 'service', 'ticker')),
  title        text not null,
  title_es     text,
  body         text,
  body_es      text,
  -- An IconName from apps/web/src/components/ui/Icon.tsx; used when image_url
  -- is null. `text`, not an enum: IconName is a *web* type the DB can't see, so
  -- it is validated in the admin zod schema against a mirrored literal union
  -- and the admin control is a Select of known icons, never free text.
  icon         text,
  image_url    text,          -- site-images bucket
  href         text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_home_tiles_slot_sort
  on public.home_tiles (slot, sort_order) where is_published;

drop trigger if exists trg_home_tiles_updated_at on public.home_tiles;
create trigger trg_home_tiles_updated_at
  before update on public.home_tiles
  for each row execute function public.set_updated_at();


-- --- 3. Featured brands ----------------------------------------------------
-- A flag on brands, not a separate table: the homepage rail IS a brand list.
alter table public.brands
  add column if not exists is_featured boolean not null default false;

create index if not exists idx_brands_featured
  on public.brands (sort_order) where is_featured;


-- --- 4. Store locations ----------------------------------------------------
-- Business data consumed by the Footer on EVERY page, not homepage content —
-- hence its own table and its own admin page.
create table if not exists public.store_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_es      text,
  -- NOT translated (an address is an address), and unique so the seed below is
  -- idempotent via `on conflict`.
  address      text not null unique,
  phone        text,
  hours        text,
  hours_es     text,
  map_url      text,
  image_url    text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_store_locations_updated_at on public.store_locations;
create trigger trg_store_locations_updated_at
  before update on public.store_locations
  for each row execute function public.set_updated_at();


-- --- 5. Storage bucket for site imagery ------------------------------------
-- A DISTINCT bucket from product-images. The orphan sweep in
-- modules/admin/service.ts lists a whole bucket and deletes anything it can't
-- find a reference for; site-images URLs live across three tables, so it is
-- deliberately excluded from that sweep registry until all three are wired.
-- Keeping it separate means a product-image sweep can never reach the hero.
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "catalog images are publicly readable" on storage.objects;
create policy "catalog images are publicly readable" on storage.objects
  for select using (bucket_id in ('product-images', 'brand-logos', 'site-images'));


-- --- 6. RLS + grants -------------------------------------------------------
-- Written inline here, not in 0002/0003: those files ran before these tables
-- existed and are not re-run. Deny-by-default, read-only for public roles; the
-- API uses the service-role key, so this is defense-in-depth if a key leaks.
alter table public.home_hero       enable row level security;
alter table public.home_tiles      enable row level security;
alter table public.store_locations enable row level security;

drop policy if exists home_hero_select_public on public.home_hero;
create policy home_hero_select_public on public.home_hero
  for select using (true);

drop policy if exists home_tiles_select_published on public.home_tiles;
create policy home_tiles_select_published on public.home_tiles
  for select using (is_published);

drop policy if exists store_locations_select_published on public.store_locations;
create policy store_locations_select_published on public.store_locations
  for select using (is_published);

grant select on public.home_hero, public.home_tiles, public.store_locations
  to anon, authenticated;
revoke insert, update, delete on public.home_hero, public.home_tiles, public.store_locations
  from anon, authenticated;


-- --- 7. Seeds --------------------------------------------------------------
-- These reproduce the CURRENT hardcoded copy exactly, so running this migration
-- does not visibly change the homepage. (The HomePage rewire that reads these
-- rows lands in the same commit.) `on conflict do nothing` everywhere, so a
-- re-run never clobbers content the client has since edited.
insert into public.home_hero (id, image_url, eyebrow, headline, subcopy, cta_label, cta_href)
values (
  true,
  '/hero.jpg',
  'Tools, Hardware & Supplies',
  'Your one-stop shop for every home-improvement project.',
  'Professional-grade doors, faucets, flooring, tiles and more — sourced for contractors and DIY builders across Jamaica.',
  'Shop the catalog',
  '/shop'
)
on conflict (id) do nothing;

-- Promo tiles: image_url stays NULL until the client uploads one (the two cards
-- previously borrowed a category photo; ImageWithFallback covers the gap).
insert into public.home_tiles (slot, title, body, icon, href, sort_order)
select v.slot, v.title, v.body, v.icon, v.href, v.sort_order
from (values
  ('promo',   'Featured picks',      null,                                 null,      '/shop?sort=featured', 0),
  ('promo',   'In stock now',        null,                                 null,      '/shop?inStock=true',  1),
  ('service', 'Islandwide delivery', 'We deliver to every parish, fast.',  'truck',   null,                  0),
  ('service', 'Genuine brands',      'Quality hardware you can build on.', 'shield',  null,                  1),
  ('service', 'Trade pricing',       'Ask about pricing for contractors.', 'tag',     null,                  2),
  ('service', 'Real support',        'WhatsApp us — a person answers.',    'headset', null,                  3),
  ('ticker',  'Islandwide delivery',            null, null, null, 0),
  ('ticker',  'Trade pricing available — ask us', null, null, null, 1),
  ('ticker',  'Genuine brands only',            null, null, null, 2),
  ('ticker',  'WhatsApp us for same-day quotes', null, null, null, 3)
) as v(slot, title, body, icon, href, sort_order)
where not exists (
  select 1 from public.home_tiles t where t.slot = v.slot and t.title = v.title
);

insert into public.store_locations (name, address, phone, hours, sort_order)
values
  ('Spanish Town Road', '279 Spanish Town Road, Kingston', '+1 (876) 430-0550', 'Mon–Sat 8am–5pm', 0),
  ('Red Hills Road',    '8 Red Hills Road, Kingston',      '+1 (876) 430-0550', 'Mon–Sat 8am–5pm', 1),
  ('South Camp Road',   '4 South Camp Road, Kingston',     '+1 (876) 430-0550', 'Mon–Sat 8am–5pm', 2)
on conflict (address) do nothing;
