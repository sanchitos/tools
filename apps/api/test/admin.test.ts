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
});
