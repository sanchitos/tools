-- ============================================================================
-- 0006_orders.sql — guest orders (cart checkout, Phase 1: no payments)
--
-- Adds `orders` + `order_items` for the storefront cart's checkout flow. There
-- is deliberately no `carts`/`cart_items` table — the cart itself lives in the
-- browser's localStorage (see apps/web/src/context/CartContext.tsx) and is only
-- ever turned into a durable row at the moment of checkout. An order captures a
-- customer's request to buy; there is no payment integration in Phase 1 — the
-- shop confirms availability and collects payment by phone/WhatsApp.
--
-- order_items SNAPSHOTS product name/sku/price/image at order time, so an order
-- reads correctly years later even if the product is renamed, repriced, or
-- deleted. `product_id` is ON DELETE SET NULL for exactly that reason: deleting
-- a product must never erase order history.
--
-- No stock decrement: Phase 1 has no inventory reservation. Placing an order
-- does not touch products.stock — see apps/api/src/modules/orders/service.ts.
--
-- Run in the Supabase SQL Editor, after 0005. Idempotent: safe to re-run.
-- ============================================================================

-- --- Status enum -------------------------------------------------------------
do $$ begin
  create type public.order_status as enum ('new', 'confirmed', 'fulfilled', 'cancelled');
exception when duplicate_object then null;
end $$;

-- --- Human-readable order numbers --------------------------------------------
-- Customers quote this on WhatsApp/phone ("TJ-000123") — a raw UUID is useless
-- for that. The sequence is global (not per-day), which is fine at this volume.
create sequence if not exists public.order_number_seq;

-- --- orders -------------------------------------------------------------------
create table if not exists public.orders (
  id                uuid primary key default gen_random_uuid(),
  order_number      text not null unique
                       default ('TJ-' || lpad(nextval('public.order_number_seq')::text, 6, '0')),
  customer_name     text not null,
  customer_phone    text not null,
  customer_email    text,
  fulfillment       text not null check (fulfillment in ('pickup', 'delivery')),
  delivery_address  text,
  notes             text,
  subtotal          numeric(12, 2) not null check (subtotal >= 0),
  currency          text not null default 'JMD' check (currency = 'JMD'),
  status            public.order_status not null default 'new',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_status on public.orders (status);

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- --- order_items ---------------------------------------------------------------
create table if not exists public.order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,
  -- ON DELETE SET NULL (not cascade): deleting a product must never erase
  -- order history. The snapshot columns below keep the line item readable
  -- even after product_id goes null.
  product_id   uuid references public.products (id) on delete set null,
  product_name text not null,
  product_sku  text,
  product_slug text,
  image_url    text,
  unit_price   numeric(12, 2) not null check (unit_price >= 0),
  quantity     integer not null check (quantity > 0 and quantity <= 999),
  line_total   numeric(12, 2) not null check (line_total >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists idx_order_items_order on public.order_items (order_id);

-- --- RLS: deny-by-default, no policies at all ---------------------------------
-- Orders hold customer names, phone numbers, and delivery addresses — only the
-- service-role API should ever read them. Unlike the catalog tables (0002),
-- we intentionally create NO select policy here: RLS enabled + zero policies
-- means every role except service_role (which bypasses RLS) sees nothing.
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;

-- --- Grants --------------------------------------------------------------------
-- Explicitly no privileges for anon/authenticated on either table (contrast
-- with 0003_grants.sql, which grants SELECT on catalog tables). The revoke is
-- defensive/documentary, matching 0003's style, since nothing above grants
-- these roles anything in the first place.
revoke all on public.orders, public.order_items from anon, authenticated;
