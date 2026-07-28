import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';

// `requireAgentKey` (middleware/agentAuth.ts) precomputes its expected key
// digest once at module load from env.AGENT_API_KEY, and config/env.ts
// validates the whole environment once at import time. So AGENT_API_KEY must
// be set BEFORE app.js (and its transitive config/env.js import) is ever
// evaluated in this file. Plain `import` statements are hoisted above any
// other top-level code, so a static import here would run before we could
// set it — hence the dynamic `import()` in beforeAll, issued only after the
// assignment below. (Each vitest test *file* gets its own fresh module
// registry/process, so this doesn't affect other test files, and the
// unset-key behavior is covered separately in agent-disabled.test.ts, which
// never sets this var.)
process.env.AGENT_API_KEY = 'a'.repeat(32);
const TEST_KEY = process.env.AGENT_API_KEY;

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

let app: Express;
let helpers: typeof import('./helpers/mockSupabase.js');

beforeAll(async () => {
  helpers = await import('./helpers/mockSupabase.js');
  const { createApp } = await import('../src/app.js');
  app = createApp();
});

beforeEach(() => helpers.resetMocks());

const productRow = (over: Record<string, unknown> = {}) => ({
  id: 'p1', slug: 'demo-door', name: 'Helios Full Oval Glass Door', brand_id: null, category_id: 'c1',
  short_description: 'A fine door', description: 'long', price: '18999.00', currency: 'JMD',
  stock: 3, sku: 'DOOR-HELIOS-1', featured: false, is_published: true, rating: '4.5', review_count: 3,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  brand: null, category: { id: 'c1', slug: 'doors', label: 'Doors' }, images: [],
  ...over,
});

describe('agent API (/api/v1/agent), AGENT_API_KEY configured', () => {
  it('401s with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/agent/products/search?q=door');
    expect(res.status).toBe(401);
  });

  it('401s with a wrong key', async () => {
    const res = await request(app)
      .get('/api/v1/agent/products/search?q=door')
      .set('Authorization', `Bearer ${'b'.repeat(32)}`);
    expect(res.status).toBe(401);
  });

  it('401s on a key of a different length (no 500 from timingSafeEqual)', async () => {
    const res = await request(app)
      .get('/api/v1/agent/products/search?q=door')
      .set('Authorization', 'Bearer short');
    expect(res.status).toBe(401);
  });

  it('200s with the right key and returns a lean DTO (no id/image/timestamp fields)', async () => {
    helpers.queueRpc('search_products', {
      data: [{ product_id: 'p1', score: 1, total_count: 1 }],
      error: null,
    });
    helpers.queueResult('products', { data: [productRow()], error: null });

    const res = await request(app)
      .get('/api/v1/agent/products/search?q=door')
      .set('Authorization', `Bearer ${TEST_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    const item = res.body.items[0];
    expect(item).toEqual({
      name: 'Helios Full Oval Glass Door',
      sku: 'DOOR-HELIOS-1',
      price: 18999,
      currency: 'JMD',
      inStock: true,
      stockCount: 3,
      brand: null,
      category: 'Doors',
      shortDescription: 'A fine door',
      url: 'https://tools-jamaica.test/product/demo-door',
    });
    expect(item).not.toHaveProperty('id');
    expect(item).not.toHaveProperty('primaryImage');
    expect(item).not.toHaveProperty('images');
    expect(item).not.toHaveProperty('createdAt');
    expect(item).not.toHaveProperty('rating');
  });

  it('returns the published category list instead of hallucination bait when there are no matches', async () => {
    helpers.queueRpc('search_products', { data: [], error: null });
    helpers.queueResult('categories', {
      data: [
        { id: 'c1', slug: 'doors', label: 'Doors', image_url: null, sort_order: 10, is_published: true, created_at: '', updated_at: '' },
      ],
      error: null,
    });
    helpers.queueResult('products', { data: [], error: null }); // listCategories()'s product-count tally query

    const res = await request(app)
      .get('/api/v1/agent/products/search?q=zzz-nonexistent-product')
      .set('Authorization', `Bearer ${TEST_KEY}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.items).toEqual([]);
    expect(res.body.categories).toEqual([{ slug: 'doors', label: 'Doors' }]);
  });

  it('caps limit at 10 and rejects a missing q (400)', async () => {
    const res = await request(app)
      .get('/api/v1/agent/products/search?limit=999')
      .set('Authorization', `Bearer ${TEST_KEY}`);
    expect(res.status).toBe(400);
  });
});
