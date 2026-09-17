import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

/** Recreate cookie-signature's signing so the server accepts our signed cookie. */
function sign(val: string, secret: string): string {
  const mac = crypto.createHmac('sha256', secret).update(val).digest('base64').replace(/=+$/, '');
  return `${val}.${mac}`;
}

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));
vi.mock('../src/lib/jwt.js', () => ({
  verifyAccessToken: vi.fn(async () => ({ sub: 'uid' })),
}));

/**
 * Only the two functions that touch Supabase Storage are stubbed —
 * `pathFromPublicUrl` stays REAL, because turning a public URL into a storage
 * path (and returning null for anything outside our buckets) is the exact logic
 * under test. Mocking it would make this suite prove nothing.
 */
const listed: Record<string, string[]> = {};
const removed: Array<{ bucket: string; paths: string[] }> = [];

vi.mock('../src/lib/storage.js', async () => {
  const actual = await vi.importActual<typeof import('../src/lib/storage.js')>(
    '../src/lib/storage.js',
  );
  return {
    ...actual,
    listAllObjectPaths: vi.fn(async (bucket: string) => listed[bucket] ?? []),
    removeObjects: vi.fn(async (bucket: string, paths: string[]) => {
      if (paths.length) removed.push({ bucket, paths });
    }),
  };
});

import { createApp } from '../src/app.js';
import { queueResult, resetMocks } from './helpers/mockSupabase.js';

const app = createApp();
const SECRET = process.env.COOKIE_SECRET!;

function adminCookies(): string {
  const at = `sw_at=${encodeURIComponent('s:' + sign('token', SECRET))}`;
  const rt = `sw_rt=${encodeURIComponent('s:' + sign('rtoken', SECRET))}`;
  return `${at}; ${rt}; sw_csrf=test-csrf-token`;
}

const adminProfile = {
  data: { id: 'uid', email: 'a@toolsja.test', full_name: 'A', role: 'admin', is_active: true, created_at: '', updated_at: '' },
  error: null,
};

const SUPABASE = 'https://example.supabase.co/storage/v1/object/public';
const publicUrl = (bucket: string, path: string) => `${SUPABASE}/${bucket}/${path}`;

/** Queue the reference rows every sweep reads, in SWEEPS order. */
function queueRefs(opts: {
  productImages?: string[];
  brandLogos?: string[];
  categoryImages?: string[];
  hero?: string[];
  tiles?: string[];
  locations?: string[];
} = {}) {
  queueResult('product_images', {
    data: (opts.productImages ?? []).map((url) => ({ url })),
    error: null,
  });
  queueResult('brands', {
    data: (opts.brandLogos ?? []).map((logo_url) => ({ logo_url })),
    error: null,
  });
  queueResult('categories', {
    data: (opts.categoryImages ?? []).map((image_url) => ({ image_url })),
    error: null,
  });
  queueResult('home_hero', { data: (opts.hero ?? []).map((image_url) => ({ image_url })), error: null });
  queueResult('home_tiles', { data: (opts.tiles ?? []).map((image_url) => ({ image_url })), error: null });
  queueResult('store_locations', {
    data: (opts.locations ?? []).map((image_url) => ({ image_url })),
    error: null,
  });
}

function sweep(dryRun = false) {
  return request(app)
    .post(`/api/v1/admin/images/cleanup-orphans${dryRun ? '?dryRun=true' : ''}`)
    .set('Cookie', adminCookies())
    .set('x-csrf-token', 'test-csrf-token');
}

describe('orphan image sweep', () => {
  beforeEach(() => {
    resetMocks();
    for (const k of Object.keys(listed)) delete listed[k];
    removed.length = 0;
  });

  it('deletes only objects no row references', async () => {
    queueResult('profiles', adminProfile);
    listed['product-images'] = ['p1/keep.jpg', 'p1/orphan.jpg'];
    queueRefs({
      productImages: [publicUrl('product-images', 'p1/keep.jpg')],
      // Every other bucket is empty, so its sweep short-circuits before the
      // tripwire — an empty bucket is not a broken reference query.
    });

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual(['product-images/p1/orphan.jpg']);
    expect(removed).toEqual([{ bucket: 'product-images', paths: ['p1/orphan.jpg'] }]);
  });

  it('dryRun resolves the identical list and deletes nothing', async () => {
    queueResult('profiles', adminProfile);
    listed['product-images'] = ['p1/keep.jpg', 'p1/orphan.jpg'];
    queueRefs({ productImages: [publicUrl('product-images', 'p1/keep.jpg')] });

    const res = await sweep(true);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: 1, paths: ['product-images/p1/orphan.jpg'], dryRun: true });
    expect(removed).toEqual([]);
  });

  // --- site-images: the three-source union -----------------------------------
  // This bucket is the dangerous one. Each case below drops exactly one
  // reference source and asserts that image SURVIVES — which is what fails,
  // loudly, if someone ever removes an entry from siteImageRefs().

  it.each([
    ['home_hero', 'hero/hero.jpg'],
    ['home_tiles', 'tiles/promo.jpg'],
    ['store_locations', 'locations/branch.jpg'],
  ])('keeps a site-image referenced only by %s', async (_source, livePath) => {
    queueResult('profiles', adminProfile);
    listed['site-images'] = [livePath, 'hero/stale.jpg'];
    queueRefs({
      hero: _source === 'home_hero' ? [publicUrl('site-images', livePath)] : [],
      tiles: _source === 'home_tiles' ? [publicUrl('site-images', livePath)] : [],
      locations: _source === 'store_locations' ? [publicUrl('site-images', livePath)] : [],
    });

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual(['site-images/hero/stale.jpg']);
    expect(removed).toEqual([{ bucket: 'site-images', paths: ['hero/stale.jpg'] }]);
  });

  it('keeps site-images referenced across all three tables at once', async () => {
    queueResult('profiles', adminProfile);
    listed['site-images'] = ['hero/hero.jpg', 'tiles/promo.jpg', 'locations/branch.jpg', 'tiles/gone.jpg'];
    queueRefs({
      hero: [publicUrl('site-images', 'hero/hero.jpg')],
      tiles: [publicUrl('site-images', 'tiles/promo.jpg')],
      locations: [publicUrl('site-images', 'locations/branch.jpg')],
    });

    const res = await sweep();
    expect(res.body.paths).toEqual(['site-images/tiles/gone.jpg']);
  });

  it('never touches an externally-hosted seed URL', async () => {
    // An unsplash URL yields null from pathFromPublicUrl, so it contributes no
    // reference — but it also names no object IN the bucket, so nothing of ours
    // is at risk. What must not happen is the real file being swept because the
    // external row "used up" the reference set.
    queueResult('profiles', adminProfile);
    listed['site-images'] = ['hero/hero.jpg'];
    queueRefs({
      hero: ['https://images.unsplash.com/photo-123'],
      tiles: [publicUrl('site-images', 'hero/hero.jpg')],
    });

    const res = await sweep();
    expect(res.body.paths).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('skips a non-empty bucket whose reference query returned nothing (tripwire)', async () => {
    queueResult('profiles', adminProfile);
    listed['site-images'] = ['hero/hero.jpg', 'tiles/promo.jpg'];
    queueRefs(); // all three site sources empty -> looks like every object is unused

    const res = await sweep();
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual([]);
    expect(removed).toEqual([]); // refused, not emptied
  });

  it('requires an admin session', async () => {
    queueResult('profiles', { ...adminProfile, data: { ...adminProfile.data, role: 'customer' } });
    const res = await sweep(true);
    expect(res.status).toBe(403);
  });
});
