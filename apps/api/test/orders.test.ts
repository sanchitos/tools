import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';
import { queueResult, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();

const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

const productRow = (over: Record<string, unknown> = {}) => ({
  id: PRODUCT_ID,
  slug: 'demo-door',
  name: 'Demo Door',
  brand_id: null,
  category_id: 'c1',
  short_description: null,
  description: null,
  price: '1000.00',
  currency: 'JMD',
  stock: 5,
  sku: 'SKU1',
  featured: false,
  is_published: true,
  rating: '0',
  review_count: 0,
  created_at: '',
  updated_at: '',
  images: [{ url: 'https://x/y.jpg', is_primary: true, sort_order: 0 }],
  ...over,
});

const validBody = {
  customerName: 'Jane Shopper',
  customerPhone: '+1 (876) 555-1234',
  fulfillment: 'pickup' as const,
  items: [{ productId: PRODUCT_ID, quantity: 3 }],
};

const orderRow = (over: Record<string, unknown> = {}) => ({
  id: 'o1',
  order_number: 'TJ-000001',
  customer_name: 'Jane Shopper',
  customer_phone: '+1 (876) 555-1234',
  customer_email: null,
  fulfillment: 'pickup',
  delivery_address: null,
  notes: null,
  subtotal: '3000.00',
  currency: 'JMD',
  status: 'new',
  created_at: '',
  updated_at: '',
  ...over,
});

const orderItemRow = (over: Record<string, unknown> = {}) => ({
  id: 'oi1',
  order_id: 'o1',
  product_id: PRODUCT_ID,
  product_name: 'Demo Door',
  product_sku: 'SKU1',
  product_slug: 'demo-door',
  image_url: 'https://x/y.jpg',
  unit_price: '1000.00',
  quantity: 3,
  line_total: '3000.00',
  created_at: '',
  ...over,
});

describe('orders API', () => {
  beforeEach(() => resetMocks());

  it('POST /orders creates an order priced server-side, ignoring any client-supplied price/subtotal', async () => {
    queueResult('products', { data: [productRow()], error: null });
    queueResult('orders', { data: orderRow(), error: null });
    queueResult('order_items', { data: [orderItemRow()], error: null });

    const res = await request(app)
      .post('/api/v1/orders')
      // Smuggled price/subtotal fields must be stripped by zod and never used.
      .send({ ...validBody, price: 1, subtotal: 1, items: [{ ...validBody.items[0], price: 1 }] });

    expect(res.status).toBe(201);
    expect(res.body.orderNumber).toBe('TJ-000001');
    // 1000.00 (server price) * 3 = 3000, not the smuggled 1.
    expect(res.body.subtotal).toBe(3000);
    expect(res.body.items[0].unitPrice).toBe(1000);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it('POST /orders rejects an unknown productId (400)', async () => {
    queueResult('products', { data: [], error: null }); // none of the requested ids matched
    const res = await request(app).post('/api/v1/orders').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /orders rejects an unpublished product (400)', async () => {
    queueResult('products', { data: [productRow({ is_published: false })], error: null });
    const res = await request(app).post('/api/v1/orders').send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it('POST /orders rejects an out-of-stock product (409)', async () => {
    queueResult('products', { data: [productRow({ stock: 0 })], error: null });
    const res = await request(app).post('/api/v1/orders').send(validBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('POST /orders requires a delivery address when fulfillment is "delivery" (400)', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .send({ ...validBody, fulfillment: 'delivery' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /admin/orders rejects an anonymous request (401)', async () => {
    const res = await request(app).get('/api/v1/admin/orders');
    expect(res.status).toBe(401);
  });
});
