-- ============================================================================
-- seed.sql — starter data for Tools Jamaica (run once, after 0001–0004).
--
-- Categories are the real Phase-1 set. Brands + products are DEMO/sample data
-- (clearly disposable) so the catalog API and Shop/PDP pages have something to
-- render during development — delete them from the admin once real data lands.
-- Prices are JMD. Idempotent: re-running does not duplicate rows.
-- ============================================================================

-- --- Categories (admin-managed; images from the live toolsja.com store) -----
insert into public.categories (slug, label, image_url, sort_order) values
  ('doors',        'Doors',         'https://toolsja.com/wp-content/uploads/2022/05/Door-768x768.jpg',          10),
  ('faucets',      'Faucets',       'https://toolsja.com/wp-content/uploads/2022/05/Faucet-768x768.jpg',        20),
  ('flooring',     'Flooring',      'https://toolsja.com/wp-content/uploads/2022/05/flooring.jpg',              30),
  ('tiles',        'Tiles',         'https://toolsja.com/wp-content/uploads/2022/05/Cesano.jpg',                40),
  ('kitchen',      'Kitchen',       'https://toolsja.com/wp-content/uploads/2022/05/kitchen.jpg',               50),
  ('sanitary-ware','Sanitary Ware', 'https://toolsja.com/wp-content/uploads/2022/05/Sanitary-Ware-768x768.jpg', 60),
  ('windows',      'Windows',       'https://toolsja.com/wp-content/uploads/2022/05/window-768x768.jpg',        70),
  ('sale',         'Sale',          null,                                                                       80)
on conflict (slug) do nothing;

-- --- Brands (DEMO) ----------------------------------------------------------
insert into public.brands (name, slug, sort_order) values
  ('AquaFlow',  'aquaflow',  10),
  ('TerraTile', 'terratile', 20),
  ('FortiDoor', 'fortidoor', 30)
on conflict (slug) do nothing;

-- --- Products (DEMO) --------------------------------------------------------
insert into public.products
  (slug, name, brand_id, category_id, short_description, description, price, stock, sku, featured, rating, review_count)
values
  ('helios-full-oval-glass-door',
   'Helios Full Oval Glass Door',
   (select id from public.brands where slug = 'fortidoor'),
   (select id from public.categories where slug = 'doors'),
   'Solid mahogany exterior door with a full oval bevelled-glass insert.',
   'A statement entry door in kiln-dried mahogany with a decorative full-oval bevelled glass panel. Pre-hung and ready to finish.',
   49999.00, 8, 'DR-HELIOS-OVL', true, 4.6, 12),

  ('single-lever-basin-faucet',
   'Single-Lever Basin Faucet',
   (select id from public.brands where slug = 'aquaflow'),
   (select id from public.categories where slug = 'faucets'),
   'Chrome-finish single-lever mixer for bathroom basins.',
   'Ceramic-disc cartridge for drip-free control, solid brass body, and a brushed-chrome finish. Includes flexible supply hoses.',
   12499.00, 40, 'FC-AQ-BASIN1', true, 4.4, 27),

  ('oak-finish-laminate-flooring',
   'Oak-Finish Laminate Flooring',
   (select id from public.brands where slug = 'terratile'),
   (select id from public.categories where slug = 'flooring'),
   'AC4 click-lock laminate, warm oak tone (per box, 2.13 m²).',
   'Hard-wearing AC4-rated laminate with a realistic oak grain and a quiet underlay-ready click-lock profile. Sold per box (2.13 m²).',
   3599.00, 220, 'FL-OAK-AC4', false, 4.2, 9),

  ('aluminium-sliding-window',
   'Aluminium Sliding Window',
   null,
   (select id from public.categories where slug = 'windows'),
   'Powder-coated aluminium sliding window with tinted glass.',
   'Corrosion-resistant powder-coated frame, smooth dual-track slider, and tinted tempered glass for glare and heat reduction.',
   28999.00, 15, 'WN-ALU-SLD', false, 4.5, 6),

  ('modular-kitchen-cabinet-set',
   'Modular Kitchen Cabinet Set',
   null,
   (select id from public.categories where slug = 'kitchen'),
   'Base + wall cabinet starter set in matte white.',
   'Moisture-resistant carcasses with soft-close hinges and adjustable shelves. A flexible starter configuration you can extend module by module.',
   134999.00, 5, 'KT-MOD-START', true, 4.7, 4),

  ('close-coupled-toilet-suite',
   'Close-Coupled Toilet Suite',
   (select id from public.brands where slug = 'aquaflow'),
   (select id from public.categories where slug = 'sanitary-ware'),
   'Dual-flush close-coupled WC with soft-close seat.',
   'Water-saving 3/6 L dual flush, vitreous-china pan and cistern, and a quiet soft-close seat included.',
   24999.00, 22, 'SW-WC-CC1', false, 4.3, 18),

  ('sienna-porcelain-tile-750',
   'Sienna Porcelain Tile 750',
   (select id from public.brands where slug = 'terratile'),
   (select id from public.categories where slug = 'tiles'),
   'Rectified porcelain floor tile, sienna tone (per m²).',
   'Through-body porcelain with a matte anti-slip finish, rectified edges for tight grout lines. Priced per m².',
   2899.00, 500, 'TL-SIENNA-75', false, 4.1, 15),

  ('portofino-white-tile-600',
   'Portofino White Tile 600',
   (select id from public.brands where slug = 'terratile'),
   (select id from public.categories where slug = 'tiles'),
   'Gloss white ceramic wall tile (per m²).',
   'Bright gloss glaze for kitchens and bathrooms, easy-clean surface, calibrated for consistent coverage. Priced per m².',
   2199.00, 500, 'TL-PORTO-60', false, 4.0, 7)
on conflict (slug) do nothing;

-- --- Primary images (DEMO; live-store URLs). Guarded against re-run dupes. ---
insert into public.product_images (product_id, url, is_primary, alt_text, sort_order)
select p.id, v.url, true, v.alt, 0
from (values
  ('helios-full-oval-glass-door',  'https://toolsja.com/wp-content/uploads/2022/05/Door-768x768.jpg',          'Helios full oval glass mahogany door'),
  ('single-lever-basin-faucet',    'https://toolsja.com/wp-content/uploads/2022/05/Faucet-768x768.jpg',        'Chrome single-lever basin faucet'),
  ('oak-finish-laminate-flooring', 'https://toolsja.com/wp-content/uploads/2022/05/Flooring-1-768x768.jpg',    'Oak-finish laminate flooring plank'),
  ('aluminium-sliding-window',     'https://toolsja.com/wp-content/uploads/2022/05/window-768x768.jpg',        'Aluminium sliding window'),
  ('modular-kitchen-cabinet-set',  'https://toolsja.com/wp-content/uploads/2022/05/Kitchen-1-768x768.jpg',     'Modular kitchen cabinet set'),
  ('close-coupled-toilet-suite',   'https://toolsja.com/wp-content/uploads/2022/05/Sanitary-Ware-768x768.jpg', 'Close-coupled toilet suite'),
  ('sienna-porcelain-tile-750',    'https://toolsja.com/wp-content/uploads/2022/06/Sienna75-300x300.jpeg',     'Sienna porcelain tile'),
  ('portofino-white-tile-600',     'https://toolsja.com/wp-content/uploads/2022/06/Portofinowhite-300x300.jpeg','Portofino white gloss tile')
) as v(slug, url, alt)
join public.products p on p.slug = v.slug
where not exists (
  select 1 from public.product_images pi
  where pi.product_id = p.id and pi.url = v.url
);

-- --- Specs + highlights for one product (exercises the PDP). Guarded. -------
insert into public.product_specs (product_id, label, value, sort_order)
select p.id, s.label, s.value, s.sort_order
from public.products p
join (values
  ('Material', 'Kiln-dried mahogany', 0),
  ('Glass', 'Full oval bevelled', 1),
  ('Dimensions', '36" x 80"', 2),
  ('Hanging', 'Pre-hung, left/right', 3)
) as s(label, value, sort_order) on true
where p.slug = 'helios-full-oval-glass-door'
  and not exists (
    select 1 from public.product_specs ps
    where ps.product_id = p.id and ps.label = s.label
  );

insert into public.product_highlights (product_id, text, sort_order)
select p.id, h.text, h.sort_order
from public.products p
join (values
  ('Solid mahogany, not veneer', 0),
  ('Decorative bevelled glass insert', 1),
  ('Pre-hung and ready to finish', 2)
) as h(text, sort_order) on true
where p.slug = 'helios-full-oval-glass-door'
  and not exists (
    select 1 from public.product_highlights ph
    where ph.product_id = p.id and ph.text = h.text
  );
