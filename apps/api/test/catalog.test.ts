import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';
import { queueResult, queueRpc, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1', slug: 'demo-product', name: 'Demo Product', brand_id: null, category_id: 'c1',
  short_description: 'short', description: 'long', price: '1999.00', currency: 'JMD',
  stock: 5, sku: 'SKU1', featured: true, is_published: true, rating: '4.5', review_count: 3,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  brand: null, category: { id: 'c1', slug: 'doors', label: 'Doors' },
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
      data: [{ id: 'c1', slug: 'doors', label: 'Doors', image_url: null, sort_order: 10, is_published: true, created_at: '', updated_at: '' }],
      error: null,
    });
    queueResult('products', { data: [{ category_id: 'c1' }, { category_id: 'c1' }], error: null });
    const res = await request(app).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ slug: 'doors', label: 'Doors', productCount: 2 });
    expect(res.body[0]).not.toHaveProperty('isPublished');
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
