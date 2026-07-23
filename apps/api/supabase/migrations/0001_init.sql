-- ============================================================================
-- 0001_init.sql — Tools Jamaica schema (Phase 1: catalog + admin identity)
--
-- Run in the Supabase SQL Editor. Idempotent: safe to re-run. Never run schema
-- changes from application code — add the next numbered migration instead.
--
-- Conventions: all tables public.*, UUID PKs (gen_random_uuid()),
-- created_at/updated_at timestamptz, money NUMERIC(12,2) in JMD.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- trigram search for the Shop page

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

-- Keeps updated_at current on any row update.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity: profiles (1:1 with auth.users). Admin-only this phase; `role`
-- is forward-compatible with customers later (default 'customer').
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.user_role as enum ('admin', 'customer');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       public.user_role not null default 'customer',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile whenever a Supabase auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Catalog: brands
-- ---------------------------------------------------------------------------

create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  logo_url   text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_brands_updated_at on public.brands;
create trigger trg_brands_updated_at
  before update on public.brands
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog: categories (dynamic, admin-managed — FK from products, not an enum)
-- ---------------------------------------------------------------------------

create table if not exists public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  label        text not null,
  image_url    text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists trg_categories_updated_at on public.categories;
create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Catalog: products
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  name              text not null,
  brand_id          uuid references public.brands (id) on delete set null,
  category_id       uuid references public.categories (id) on delete restrict,
  short_description text,
  description       text,
  price             numeric(12, 2) not null default 0 check (price >= 0),
  currency          text not null default 'JMD' check (currency = 'JMD'),
  stock             integer not null default 0 check (stock >= 0),
  sku               text unique,
  featured          boolean not null default false,
  is_published      boolean not null default true,
  rating            numeric(2, 1) not null default 0 check (rating >= 0 and rating <= 5),
  review_count      integer not null default 0 check (review_count >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create index if not exists idx_products_category on public.products (category_id);
create index if not exists idx_products_brand on public.products (brand_id);
create index if not exists idx_products_published on public.products (is_published);
create index if not exists idx_products_featured on public.products (featured) where featured;
create index if not exists idx_products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists idx_products_shortdesc_trgm
  on public.products using gin (short_description gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- Catalog: product_images / product_specs / product_highlights
-- ---------------------------------------------------------------------------

create table if not exists public.product_images (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url        text not null,
  is_primary boolean not null default false,
  alt_text   text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_product_images_product on public.product_images (product_id);
-- At most one primary image per product.
create unique index if not exists uq_product_images_primary
  on public.product_images (product_id) where is_primary;

create table if not exists public.product_specs (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  label      text not null,
  value      text not null,
  sort_order integer not null default 0
);

create index if not exists idx_product_specs_product on public.product_specs (product_id);

create table if not exists public.product_highlights (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  text       text not null,
  sort_order integer not null default 0
);

create index if not exists idx_product_highlights_product on public.product_highlights (product_id);
