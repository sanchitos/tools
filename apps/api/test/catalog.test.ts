import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';
import { db, queueResult, queueRpc, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1', slug: 'demo-product', name: 'Demo Product', brand_id: null, category_id: 'c1',
  name_es: 'Producto Demo', short_description: 'short', short_description_es: 'corto',
  description: 'long', description_es: null, price: '1999.00', currency: 'JMD',
  stock: 5, sku: 'SKU1', featured: true, is_published: true, rating: '4.5', review_count: 3,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  brand: null, category: { id: 'c1', slug: 'doors', label: 'Doors', label_es: 'Puertas' },
  images: [{ id: 'i1', product_id: 'p1', url: 'https://x/y.jpg', is_primary: true, alt_text: 'a', sort_order: 0, created_at: '2026-01-01T00:00:00Z' }],
  ...over,
});

describe('catalog API', () => {
  beforeEach(() => resetMocks());

  it('GET /products validates the sort param (400)', async () => {
    const res = await request(app).get('/api/v1/products?sort=bogus');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /products returns a paginated envelope of summary DTOs', async () => {
    queueResult('products', { data: [productRow()], error: null, count: 1 });
    const res = await request(app).get('/api/v1/products?page=1&pageSize=12');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    const item = res.body.items[0];
    expect(item.slug).toBe('demo-product');
    expect(item.price).toBe(1999); // NUMERIC string -> number via resolvePrice
    expect(item.primaryImage.url).toBe('https://x/y.jpg');
    // admin-only fields must be stripped from the public DTO
    expect(item).not.toHaveProperty('isPublished');
  });

  it('GET /categories maps rows and attaches product counts', async () => {
    queueResult('categories', {
      data: [{ id: 'c1', slug: 'doors', label: 'Doors', image_url: null, parent_id: null, sort_order: 10, is_published: true, created_at: '', updated_at: '' }],
      error: null,
    });
    // `id` matters: the tally de-duplicates by product id (a product can reach a
    // category as its main one AND as a subcategory tag).
    queueResult('products', { data: [{ id: 'p1', category_id: 'c1' }, { id: 'p2', category_id: 'c1' }], error: null });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ slug: 'doors', label: 'Doors', parentId: null, productCount: 2 });
    expect(res.body[0]).not.toHaveProperty('isPublished');
  });

  const TILES_TREE = [
    { id: 'c-tiles', slug: 'tiles', label: 'Tiles', image_url: null, parent_id: null, sort_order: 10, is_published: true, created_at: '', updated_at: '' },
    { id: 'c-ceramic', slug: 'ceramic', label: 'Ceramic', image_url: null, parent_id: 'c-tiles', sort_order: 1, is_published: true, created_at: '', updated_at: '' },
    { id: 'c-porcelain', slug: 'porcelain', label: 'Porcelain', image_url: null, parent_id: 'c-tiles', sort_order: 2, is_published: true, created_at: '', updated_at: '' },
  ];

  it('GET /categories counts subcategory products through the junction and rolls them up', async () => {
    queueResult('categories', { data: TILES_TREE, error: null });
    // Since 0012 every product's category_id is the DEPARTMENT; the subcategory
    // is a tag, so a child's own count comes entirely from the junction.
    queueResult('products', {
      data: [{ id: 'p1', category_id: 'c-tiles' }, { id: 'p2', category_id: 'c-tiles' }],
      error: null,
    });
    queueResult('product_subcategories', {
      data: [{ product_id: 'p2', category_id: 'c-ceramic' }],
      error: null,
    });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const bySlug = (s: string) => res.body.find((c: { slug: string }) => c.slug === s);
    expect(bySlug('tiles')).toMatchObject({ parentId: null, productCount: 2 });
    expect(bySlug('ceramic')).toMatchObject({ parentId: 'c-tiles', productCount: 1 });
    expect(bySlug('porcelain')).toMatchObject({ productCount: 0 });
  });

  it('GET /categories counts a product tagged with two subcategories of one parent ONCE', async () => {
    queueResult('categories', { data: TILES_TREE, error: null });
    queueResult('products', { data: [{ id: 'p1', category_id: 'c-tiles' }], error: null });
    queueResult('product_subcategories', {
      data: [
        { product_id: 'p1', category_id: 'c-ceramic' },
        { product_id: 'p1', category_id: 'c-porcelain' },
      ],
      error: null,
    });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const tiles = res.body.find((c: { slug: string }) => c.slug === 'tiles');
    // The naive "own + sum(children)" tally reported 3 here. Sets keyed on the
    // product id are what make the roll-up idempotent.
    expect(tiles).toMatchObject({ parentId: null, productCount: 1 });
  });

  it('GET /categories still rolls up a LEGACY product whose main category is a child', async () => {
    queueResult('categories', { data: TILES_TREE, error: null });
    // A row that predates 0012's backfill: category_id points at the child.
    queueResult('products', { data: [{ id: 'p1', category_id: 'c-ceramic' }], error: null });
    queueResult('product_subcategories', { data: [], error: null });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    const bySlug = (s: string) => res.body.find((c: { slug: string }) => c.slug === s);
    expect(bySlug('ceramic')).toMatchObject({ productCount: 1 });
    expect(bySlug('tiles')).toMatchObject({ productCount: 1 });
  });

  it('GET /products?category=<parent> expands to include child-category products (plain path)', async () => {
    // resolveCategoryFilter: requested slug "tiles" -> parent row.
    queueResult('categories', { data: [{ id: 'c-tiles', slug: 'tiles', parent_id: null }], error: null });
    // resolveCategoryFilter: children of c-tiles.
    queueResult('categories', { data: [{ slug: 'ceramic' }, { slug: 'porcelain' }], error: null });
    // idsForSlugs: resolve the expanded slug set (tiles, ceramic, porcelain) to ids.
    queueResult('categories', {
      data: [{ id: 'c-tiles' }, { id: 'c-ceramic' }, { id: 'c-porcelain' }],
      error: null,
    });
    queueResult('products', {
      data: [productRow({ category: { id: 'c-ceramic', slug: 'ceramic', label: 'Ceramic' } })],
      error: null,
      count: 1,
    });

    const res = await request(app).get('/api/v1/products?category=tiles');
    expect(res.status).toBe(200);
    expect(res.body.items[0].category.slug).toBe('ceramic');
    // A DEPARTMENT filter needs no junction lookup: every tag's parent IS the
    // product's main category, so category_id alone already matches them. That
    // is what keeps a product-id list out of the request URL on the common path.
    expect(db.from).not.toHaveBeenCalledWith('product_subcategories');
  });

  it('GET /products?category=<subcategory> matches products through the junction table', async () => {
    // resolveCategoryFilter: "ceramic" is a CHILD, so no expansion, and its id
    // is the one tag lookup we do.
    queueResult('categories', { data: [{ id: 'c-ceramic', slug: 'ceramic', parent_id: 'c-tiles' }], error: null });
    queueResult('categories', { data: [{ id: 'c-ceramic' }], error: null }); // idsForSlugs
    queueResult('product_subcategories', { data: [{ product_id: 'p-tagged' }], error: null });
    queueResult('products', { data: [productRow({ id: 'p-tagged' })], error: null, count: 1 });

    const res = await request(app).get('/api/v1/products?category=ceramic');
    expect(res.status).toBe(200);
    expect(res.body.items[0].id).toBe('p-tagged');
    // The two legs are OR'd: a legacy row still pointing at the child, or a tag.
    const orArg = db.from.mock.results
      .map((r) => r.value as { or: { mock: { calls: unknown[][] } } })
      .flatMap((b) => b.or.mock.calls)
      .flat()[0] as string | undefined;
    expect(orArg).toBe('category_id.in.(c-ceramic),id.in.(p-tagged)');
  });

  it('GET /products?q=&category=<parent> expands categories before calling search_products RPC', async () => {
    queueResult('categories', { data: [{ id: 'c-tiles', slug: 'tiles', parent_id: null }], error: null });
    queueResult('categories', { data: [{ slug: 'ceramic' }, { slug: 'porcelain' }], error: null });
    queueRpc('search_products', {
      data: [{ product_id: 'p1', score: 1, total_count: 1 }],
      error: null,
    });
    queueResult('products', { data: [productRow()], error: null });

    const res = await request(app).get('/api/v1/products?q=door&category=tiles');
    expect(res.status).toBe(200);

    const rpcCalls = db.rpc.mock.calls.filter(([name]) => name === 'search_products');
    const [, rpcArgs] = rpcCalls[rpcCalls.length - 1] as [string, { p_category_slugs: string[] }];
    expect(rpcArgs.p_category_slugs).toEqual(expect.arrayContaining(['tiles', 'ceramic', 'porcelain']));
    expect(rpcArgs.p_category_slugs).toHaveLength(3);
  });

  it('GET /products?lang=es resolves _es columns, falling back per field', async () => {
    queueResult('products', { data: [productRow()], error: null, count: 1 });
    const res = await request(app).get('/api/v1/products?lang=es');
    expect(res.status).toBe(200);
    const item = res.body.items[0];
    expect(item.name).toBe('Producto Demo');
    expect(item.shortDescription).toBe('corto');
    expect(item.category.label).toBe('Puertas');
    // The public DTO shape is unchanged — resolution happens server-side.
    expect(item).not.toHaveProperty('nameEs');
  });

  it('a blank _es string is treated as absent, not as a blank product name', async () => {
    // An admin who types into name_es and then clears it leaves '' behind; a
    // naive `?? ` would render a nameless product on the storefront.
    queueResult('products', {
      data: [productRow({ name_es: '   ', short_description_es: '' })],
      error: null,
      count: 1,
    });
    const res = await request(app).get('/api/v1/products?lang=es');
    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Demo Product');
    expect(res.body.items[0].shortDescription).toBe('short');
  });

  it('GET /products?lang=fr degrades to English rather than 400-ing the page', async () => {
    queueResult('products', { data: [productRow()], error: null, count: 1 });
    const res = await request(app).get('/api/v1/products?lang=fr');
    expect(res.status).toBe(200);
    expect(res.body.items[0].name).toBe('Demo Product');
  });

  it('search passes p_lang to the RPC so the Spanish config + fallback leg apply', async () => {
    queueRpc('search_products', {
      data: [{ product_id: 'p1', score: 1, total_count: 1 }],
      error: null,
    });
    queueResult('products', { data: [productRow()], error: null });

    const res = await request(app).get('/api/v1/products?q=taladro&lang=es');
    expect(res.status).toBe(200);

    const rpcCalls = db.rpc.mock.calls.filter(([name]) => name === 'search_products');
    const [, rpcArgs] = rpcCalls[rpcCalls.length - 1] as [string, { p_lang: string }];
    expect(rpcArgs.p_lang).toBe('es');
    expect(res.body.items[0].name).toBe('Producto Demo');
  });

  it('GET /products/:slug returns 404 when missing', async () => {
    queueResult('products', { data: null, error: null }); // maybeSingle -> null
    const res = await request(app).get('/api/v1/products/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('GET /products?q= still paginates, routed through search_products (0005_search.sql)', async () => {
    queueRpc('search_products', {
      data: [{ product_id: 'p1', score: 1, total_count: 1 }],
      error: null,
    });
    queueResult('products', { data: [productRow()], error: null });

    const res = await request(app).get('/api/v1/products?q=door&page=1&pageSize=12');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(12);
    expect(res.body.items[0].slug).toBe('demo-product');
  });

  it('q + sort=price-asc paginates without duplicating rows across pages (reorders by RPC position, not score)', async () => {
    // The RPC already applied ORDER BY price ASC + LIMIT/OFFSET server-side;
    // the service must preserve THIS order when mapping ids back to rows,
    // not re-sort by score (which would silently override an explicit sort).
    queueRpc('search_products', {
      data: [
        { product_id: 'p-cheap', score: 0.1, total_count: 2 },
        { product_id: 'p-pricey', score: 0.9, total_count: 2 },
      ],
      error: null,
    });
    queueResult('products', {
      data: [
        productRow({ id: 'p-pricey', slug: 'pricey', name: 'Pricey Door', price: '50000.00' }),
        productRow({ id: 'p-cheap', slug: 'cheap', name: 'Cheap Door', price: '5000.00' }),
      ],
      error: null,
    });

    const res = await request(app).get('/api/v1/products?q=door&sort=price-asc&page=1&pageSize=2');
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { slug: string }) => i.slug)).toEqual(['cheap', 'pricey']);
  });
});
