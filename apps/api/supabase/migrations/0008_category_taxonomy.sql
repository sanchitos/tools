-- 0008_category_taxonomy.sql
-- Seeds the real department taxonomy: 16 top-level categories with
-- subcategories under Tiles, Countertops, Faucets, Paint, and Doors.
-- Idempotent: safe to re-run. Reuses the existing tiles/faucets/doors rows as
-- parents (their sort_order is realigned to the taxonomy order below; label/
-- image_url/is_published are left untouched). Demo categories not listed here
-- (flooring, kitchen, sanitary-ware, windows, sale, …) are left in place.

-- --- Top-level (parent) categories -----------------------------------------
-- sort_order by 10s, in taxonomy order.
insert into public.categories (slug, label, sort_order, is_published)
values
  ('tiles', 'Tiles', 10, true),
  ('countertops', 'Countertops', 20, true),
  ('faucets', 'Faucets', 30, true),
  ('paint', 'Paint', 40, true),
  ('doors', 'Doors', 50, true),
  ('toilets', 'Toilets', 60, true),
  ('mosaics', 'Mosaics', 70, true),
  ('bath-tubs', 'Bath Tubs', 80, true),
  ('basin', 'Basin', 90, true),
  ('sinks', 'Sinks', 100, true),
  ('vanities', 'Vanities', 110, true),
  ('shower-doors-enclosure', 'Shower Doors & Enclosures', 120, true),
  ('shower-faucet', 'Shower Faucets', 130, true),
  ('locks', 'Locks', 140, true),
  ('grouts', 'Grouts', 150, true),
  ('thinset', 'Thinset', 160, true)
on conflict (slug) do update set sort_order = excluded.sort_order;

-- --- Subcategories -----------------------------------------------------------
-- sort_order by 1s within each parent; parent_id resolved via the parent's slug.
insert into public.categories (slug, label, sort_order, is_published, parent_id)
select v.slug, v.label, v.sort_order, true, p.id
from (
  values
    ('ceramic', 'Ceramic', 1, 'tiles'),
    ('porcelain', 'Porcelain', 2, 'tiles'),
    ('porcelain-slabs', 'Porcelain Slabs', 1, 'countertops'),
    ('granite', 'Granite', 2, 'countertops'),
    ('sintered-stone', 'Sintered Stone', 3, 'countertops'),
    ('kitchen-faucet', 'Kitchen Faucets', 1, 'faucets'),
    ('bathroom-faucet', 'Bathroom Faucets', 2, 'faucets'),
    ('exterior-paint', 'Exterior Paint', 1, 'paint'),
    ('interior-paint', 'Interior Paint', 2, 'paint'),
    ('interior-doors', 'Interior Doors', 1, 'doors'),
    ('exterior-doors', 'Exterior Doors', 2, 'doors'),
    ('security-doors', 'Security Doors', 3, 'doors')
) as v(slug, label, sort_order, parent_slug)
join public.categories p on p.slug = v.parent_slug
on conflict (slug) do update set
  sort_order = excluded.sort_order,
  parent_id = excluded.parent_id;
