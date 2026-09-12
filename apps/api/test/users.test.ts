import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

/** Recreate cookie-signature's signing so the server accepts our signed cookie. */
function sign(val: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(val).digest('base64').replace(/=+$/, '');
  return `${val}.${mac}`;
}

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));
// A real UUID, unlike admin.test.ts's 'uid': PATCH /admin/users/:id validates
// the param with idParamSchema, so the self-deactivation guard is only
// reachable with a well-formed id.
const CALLER_ID = '00000000-0000-4000-8000-000000000001';
vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: vi.fn(async () => ({ sub: '00000000-0000-4000-8000-000000000001' })),
}));
vi.mock('../src/lib/email.js', () => ({
  sendEmail: vi.fn(async () => true),
  sendConfirmationEmail: vi.fn(async () => undefined),
}));

import { createApp } from '../src/app.js';
import { queueResult, resetMocks, setCreateUser } from './helpers/mockSupabase.js';

const app = createApp();
const SECRET = process.env.COOKIE_SECRET!;

function sessionCookie(): string {
  const at = `sw_at=${encodeURIComponent('s:' + sign('token', SECRET))}`;
  const rt = `sw_rt=${encodeURIComponent('s:' + sign('rtoken', SECRET))}`;
  return `${at}; ${rt}`;
}

function sessionCookieWithCsrf(): string {
  return `${sessionCookie()}; sw_csrf=test-csrf-token`;
}

/** verifyAccessToken is stubbed to CALLER_ID, so this IS the caller. */
const profile = (role: 'admin' | 'customer') => ({
  data: { id: CALLER_ID, email: 'u@toolsja.test', full_name: 'U', role, is_active: true, created_at: '', updated_at: '' },
  error: null,
});

const otherUserRow = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'shopper@toolsja.test',
  full_name: 'Shopper',
  role: 'customer',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('admin users API', () => {
  beforeEach(() => resetMocks());

  it('rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('rejects a customer session (403)', async () => {
    queueResult('profiles', profile('customer'));
    const res = await request(app).get('/api/v1/admin/users').set('Cookie', sessionCookie());
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('lists users for an admin session', async () => {
    queueResult('profiles', profile('admin')); // requireAuth's own lookup
    queueResult('profiles', { data: [otherUserRow], error: null, count: 1 });

    const res = await request(app).get('/api/v1/admin/users').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({
      email: 'shopper@toolsja.test',
      role: 'customer',
      isActive: true,
    });
  });

  it('blocks a mutation without the CSRF header (403) even with an admin session', async () => {
    queueResult('profiles', profile('admin'));
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', sessionCookie())
      .send({ email: 'new@toolsja.test', password: 'password123', role: 'customer' });
    expect(res.status).toBe(403);
  });

  it('creates a pre-confirmed user and promotes it when role=admin', async () => {
    queueResult('profiles', profile('admin'));
    setCreateUser({ data: { user: { id: otherUserRow.id } }, error: null });
    queueResult('profiles', { data: { ...otherUserRow, role: 'admin' }, error: null });

    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', sessionCookieWithCsrf())
      .set('x-csrf-token', 'test-csrf-token')
      .send({ email: 'shopper@toolsja.test', password: 'password123', fullName: 'Shopper', role: 'admin' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ role: 'admin', email: 'shopper@toolsja.test' });
  });

  it('rejects a short password (400)', async () => {
    queueResult('profiles', profile('admin'));
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set('Cookie', sessionCookieWithCsrf())
      .set('x-csrf-token', 'test-csrf-token')
      .send({ email: 'shopper@toolsja.test', password: 'short', role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('deactivates another user', async () => {
    queueResult('profiles', profile('admin'));
    queueResult('profiles', { data: { ...otherUserRow, is_active: false }, error: null });

    const res = await request(app)
      .patch(`/api/v1/admin/users/${otherUserRow.id}`)
      .set('Cookie', sessionCookieWithCsrf())
      .set('x-csrf-token', 'test-csrf-token')
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it('refuses self-deactivation with 409', async () => {
    queueResult('profiles', profile('admin'));
    const res = await request(app)
      .patch(`/api/v1/admin/users/${CALLER_ID}`)
      .set('Cookie', sessionCookieWithCsrf())
      .set('x-csrf-token', 'test-csrf-token')
      .send({ isActive: false });
    expect(res.status).toBe(409);
  });
});

describe('account API', () => {
  beforeEach(() => resetMocks());

  it('rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/v1/account/orders');
    expect(res.status).toBe(401);
  });

  it('returns the caller\'s own orders, with line items', async () => {
    queueResult('profiles', profile('customer')); // a customer session is enough here
    queueResult('orders', {
      data: [{
        id: 'o1', user_id: CALLER_ID, order_number: 'TJ-000001', customer_name: 'U',
        customer_phone: '8765551234', customer_email: 'u@toolsja.test', fulfillment: 'pickup',
        delivery_address: null, notes: null, subtotal: '1000.00', currency: 'JMD',
        status: 'new', created_at: '', updated_at: '',
      }],
      error: null,
    });
    queueResult('order_items', {
      data: [{
        id: 'i1', order_id: 'o1', product_id: 'p1', product_name: 'Hammer', product_sku: 'H1',
        product_slug: 'hammer', image_url: null, unit_price: '1000.00', quantity: 1,
        line_total: '1000.00', created_at: '',
      }],
      error: null,
    });

    const res = await request(app).get('/api/v1/account/orders').set('Cookie', sessionCookie());
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ orderNumber: 'TJ-000001', subtotal: 1000 });
    expect(res.body[0].items).toHaveLength(1);
    // user_id is the server's scoping key, not something the shopper's DTO carries.
    expect(res.body[0]).not.toHaveProperty('userId');
  });
});
