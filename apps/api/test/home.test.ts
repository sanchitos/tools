import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';
import { queueResult, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();

const heroRow = (over: Record<string, unknown> = {}) => ({
  id: true,
  image_url: '/hero.jpg',
  eyebrow: 'Tools, Hardware & Supplies',
  eyebrow_es: null,
  headline: 'Your one-stop shop',
  headline_es: 'Tu tienda única',
  subcopy: 'Sourced for contractors.',
  subcopy_es: null,
  cta_label: 'Shop the catalog',
  cta_label_es: null,
  cta_href: '/shop',
  created_at: '',
  updated_at: '',
  ...over,
});

const tileRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  slot: 'service',
  title: 'Islandwide delivery',
  title_es: 'Envío a toda la isla',
  body: 'We deliver to every parish.',
  body_es: null,
  icon: 'truck',
  image_url: null,
  href: null,
  sort_order: 0,
  is_published: true,
  created_at: '',
  updated_at: '',
  ...over,
});

const locationRow = (over: Record<string, unknown> = {}) => ({
  id: 'l1',
  name: 'Spanish Town Road',
  name_es: null,
  address: '279 Spanish Town Road, Kingston',
  phone: '+1 (876) 430-0550',
  hours: 'Mon–Sat 8am–5pm',
  hours_es: 'Lun–Sáb 8am–5pm',
  map_url: null,
  image_url: null,
  sort_order: 0,
  is_published: true,
  created_at: '',
  updated_at: '',
  ...over,
});

const brandRow = (over: Record<string, unknown> = {}) => ({
  id: 'b1',
  name: 'DeWalt',
  slug: 'dewalt',
  logo_url: 'https://x/logo.png',
  sort_order: 0,
  is_featured: true,
  created_at: '',
  updated_at: '',
  ...over,
});

/** GET /home resolves four sources in parallel; queue them in that order. */
function queueHome() {
  queueResult('home_hero', { data: heroRow(), error: null });
  queueResult('home_tiles', {
    data: [tileRow(), tileRow({ id: 't2', slot: 'promo', title: 'In stock now', href: '/shop?inStock=true' })],
    error: null,
  });
  queueResult('brands', { data: [brandRow()], error: null });
  queueResult('store_locations', { data: [locationRow()], error: null });
}

describe('homepage content API', () => {
  beforeEach(() => resetMocks());

  it('GET /home returns one payload with tiles split by slot', async () => {
    queueHome();
    const res = await request(app).get('/api/v1/home');
    expect(res.status).toBe(200);
    expect(res.body.hero.headline).toBe('Your one-stop shop');
    expect(res.body.services).toHaveLength(1);
    expect(res.body.promos).toHaveLength(1);
    expect(res.body.promos[0].href).toBe('/shop?inStock=true');
    expect(res.body.featuredBrands[0].slug).toBe('dewalt');
    expect(res.body.locations[0].address).toBe('279 Spanish Town Road, Kingston');
    // admin-only fields must be stripped from the public DTO
    expect(res.body.services[0]).not.toHaveProperty('isPublished');
    expect(res.body.services[0]).not.toHaveProperty('titleEs');
  });

  it('GET /home?lang=es resolves _es columns and falls back per field', async () => {
    queueHome();
    const res = await request(app).get('/api/v1/home?lang=es');
    expect(res.status).toBe(200);
    expect(res.body.hero.headline).toBe('Tu tienda única'); // translated
    expect(res.body.hero.subcopy).toBe('Sourced for contractors.'); // NULL _es -> English
    expect(res.body.services[0].title).toBe('Envío a toda la isla');
    expect(res.body.services[0].body).toBe('We deliver to every parish.');
    expect(res.body.locations[0].hours).toBe('Lun–Sáb 8am–5pm');
    expect(res.body.locations[0].name).toBe('Spanish Town Road'); // NULL _es -> English
  });

  it('GET /home tolerates an unseeded hero rather than inventing one', async () => {
    queueResult('home_hero', { data: null, error: null });
    queueResult('home_tiles', { data: [], error: null });
    queueResult('brands', { data: [], error: null });
    queueResult('store_locations', { data: [], error: null });
    const res = await request(app).get('/api/v1/home');
    expect(res.status).toBe(200);
    expect(res.body.hero).toBeNull();
    expect(res.body.promos).toEqual([]);
  });

  it('GET /home?lang=fr degrades to English instead of 400-ing the page', async () => {
    queueHome();
    const res = await request(app).get('/api/v1/home?lang=fr');
    expect(res.status).toBe(200);
    expect(res.body.hero.headline).toBe('Your one-stop shop');
  });

  it('GET /locations is its own small endpoint, locale-resolved', async () => {
    queueResult('store_locations', { data: [locationRow()], error: null });
    const res = await request(app).get('/api/v1/locations?lang=es');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].hours).toBe('Lun–Sáb 8am–5pm');
    expect(res.body[0]).not.toHaveProperty('isPublished');
  });

  it('GET /brands/featured is not captured as a brand slug', async () => {
    queueResult('brands', { data: [brandRow()], error: null });
    const res = await request(app).get('/api/v1/brands/featured');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ slug: 'dewalt', logoUrl: 'https://x/logo.png' });
    // Brand names are never translated, so no _es leaks into the public DTO.
    expect(res.body[0]).not.toHaveProperty('isFeatured');
  });
});
