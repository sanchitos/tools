import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

/** Recreate cookie-signature's signing so the server accepts our signed cookie. */
function sign(val: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(val).digest('base64').replace(/=+$/, '');
  return `${val}.${mac}`;
}

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));
// Mock token verification so we don't hit the network JWKS / need a real JWT.
vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: vi.fn(async () => ({ sub: 'uid' })),
}));

import { createApp } from '../src/app.js';
import { queueResult, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();
const SECRET = process.env.COOKIE_SECRET!;

/** Build the signed cookie header cookie-parser expects for an httpOnly cookie. */
function sessionCookie(): string {
  const at = `sw_at=${encodeURIComponent('s:' + sign('token', SECRET))}`;
  const rt = `sw_rt=${encodeURIComponent('s:' + sign('rtoken', SECRET))}`;
  return `${at}; ${rt}`;
}

/** Session cookie plus the readable double-submit CSRF cookie, for mutating requests. */
function sessionCookieWithCsrf(): string {
  return `${sessionCookie()}; sw_csrf=test-csrf-token`;
}

const profile = (role: 'admin' | 'customer') => ({
  data: { id: 'uid', email: 'u@toolsja.test', full_name: 'U', role, is_active: true, created_at: '', updated_at: '' },
  error: null,
});

describe('admin API', () => {
  beforeEach(() => resetMocks());

  it('rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/v1/admin/products');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin session (403)', async () => {
    queueResult('profiles', profile('customer'));
    const res = await request(app).get('/api/v1/admin/products').set('Cookie', sessionCookie());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows an admin session to list products', async () => {
    queueResult('profiles', profile('admin'));
    queueResult('products', {
      data: [{
        id: 'p1', slug: 'demo', name: 'Demo', brand_id: null, category_id: 'c1',
        short_description: null, description: null, price: '10.00', currency: 'JMD',
        stock: 1, sku: null, featured: false, is_published: false, rating: '0', review_count: 0,
        created_at: '', updated_at: '', brand: null, category: null, images: [],
      }],
      error: null,
      count: 1,
    });
    const res = await request(app).get('/api/v1/admin/products').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    // admin DTO exposes the fields the public one hides
    expect(res.body.items[0]).toHaveProperty('isPublished', false);
  });

  it('blocks a mutation without a CSRF token (403) even with a session', async () => {
    queueResult('profiles', profile('admin'));
    const res = await request(app)
      .delete('/api/v1/admin/products/00000000-0000-0000-0000-000000000000')
      .set('Cookie', sessionCookie());
    expect(res.status).toBe(403);
  });

  describe('new homepage / locations routes are role-gated like the rest', () => {
    for (const path of ['/api/v1/admin/home', '/api/v1/admin/locations']) {
      it(`rejects an anonymous GET ${path} (401)`, async () => {
        const res = await request(app).get(path);
        expect(res.status).toBe(401);
      });

      it(`rejects a non-admin GET ${path} (403)`, async () => {
        queueResult('profiles', profile('customer'));
        const res = await request(app).get(path).set('Cookie', sessionCookie());
        expect(res.status).toBe(403);
      });
    }

    it('rejects an anonymous brand-logo upload (403 — CSRF guards mutations first)', async () => {
      const res = await request(app).post(
        '/api/v1/admin/brands/00000000-0000-0000-0000-000000000000/logo',
      );
      expect(res.status).toBe(403);
    });

    it('rejects a non-admin brand-logo upload that clears CSRF (403)', async () => {
      queueResult('profiles', profile('customer'));
      const res = await request(app)
        .post('/api/v1/admin/brands/00000000-0000-0000-0000-000000000000/logo')
        .set('Cookie', sessionCookieWithCsrf())
        .set('x-csrf-token', 'test-csrf-token');
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('GET /admin/home returns the hero with its raw _es fields for editing', async () => {
      queueResult('profiles', profile('admin'));
      queueResult('home_hero', {
        data: {
          id: true, image_url: null,
          eyebrow: 'Eyebrow', eyebrow_es: null,
          headline: 'Headline', headline_es: 'Titular',
          subcopy: null, subcopy_es: null,
          cta_label: null, cta_label_es: null,
          cta_href: '/shop', created_at: '', updated_at: '',
        },
        error: null,
      });
      queueResult('home_tiles', { data: [], error: null });

      const res = await request(app).get('/api/v1/admin/home').set('Cookie', sessionCookie());
      expect(res.status).toBe(200);
      // The admin DTO is ALWAYS English plus the raw _es fields: a localized
      // admin DTO would let the editor save Spanish over the English columns.
      expect(res.body.hero.headline).toBe('Headline');
      expect(res.body.hero.headlineEs).toBe('Titular');
    });

    it('admin DTOs stay English even when the request carries ?lang=es', async () => {
      queueResult('profiles', profile('admin'));
      queueResult('home_hero', {
        data: {
          id: true, image_url: null,
          eyebrow: null, eyebrow_es: null,
          headline: 'Headline', headline_es: 'Titular',
          subcopy: null, subcopy_es: null,
          cta_label: null, cta_label_es: null,
          cta_href: '/shop', created_at: '', updated_at: '',
        },
        error: null,
      });
      queueResult('home_tiles', { data: [], error: null });

      const res = await request(app)
        .get('/api/v1/admin/home?lang=es')
        .set('Cookie', sessionCookie());
      expect(res.status).toBe(200);
      expect(res.body.hero.headline).toBe('Headline');
    });
  });

  describe('category hierarchy — depth enforcement (400 BadRequest)', () => {
    const PARENT_ID = '11111111-1111-1111-1111-111111111111';
    const SELF_ID = '22222222-2222-2222-2222-222222222222';

    const post = (body: Record<string, unknown>) =>
      request(app)
        .post('/api/v1/admin/categories')
        .set('Cookie', sessionCookieWithCsrf())
        .set('x-csrf-token', 'test-csrf-token')
        .send(body);

    const patch = (id: string, body: Record<string, unknown>) =>
      request(app)
        .patch(`/api/v1/admin/categories/${id}`)
        .set('Cookie', sessionCookieWithCsrf())
        .set('x-csrf-token', 'test-csrf-token')
        .send(body);

    it('rejects a parentId that does not resolve to an existing category', async () => {
      queueResult('profiles', profile('admin'));
      queueResult('categories', { data: null, error: null }); // parent lookup -> not found
      const res = await post({ label: 'Ceramic', parentId: PARENT_ID });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects a parentId whose target already has a parent (depth > 2)', async () => {
      queueResult('profiles', profile('admin'));
      queueResult('categories', {
        data: { id: PARENT_ID, parent_id: 'some-grandparent' }, // chosen "parent" is itself a child
        error: null,
      });
      const res = await post({ label: 'Ceramic', parentId: PARENT_ID });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects a self-parent on update', async () => {
      queueResult('profiles', profile('admin'));
      const res = await patch(SELF_ID, { parentId: SELF_ID });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('rejects assigning a parent to a category that already has children', async () => {
      queueResult('profiles', profile('admin'));
      queueResult('categories', { data: { id: PARENT_ID, parent_id: null }, error: null }); // valid top-level parent
      queueResult('categories', { data: [{ id: 'existing-child' }], error: null }); // SELF_ID already has children
      const res = await patch(SELF_ID, { parentId: PARENT_ID });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });
});
