import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';
import { queueResult, resetMocks, setSignIn } from './helpers/mockSupabase.js';

const app = createApp();

const adminRow = {
  id: 'uid', email: 'admin@toolsja.test', full_name: 'Admin', role: 'admin',
  is_active: true, created_at: '', updated_at: '',
};

describe('auth API', () => {
  beforeEach(() => resetMocks());

  it('POST /auth/login rejects an invalid body (400)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });

  it('GET /auth/me without a session returns 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /auth/login with bad credentials returns 401', async () => {
    setSignIn({ data: { session: null, user: null }, error: { message: 'bad' } });
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'a@b.com', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST /auth/login sets httpOnly session cookies and returns the profile (no tokens)', async () => {
    setSignIn({ data: { session: { access_token: 'at', refresh_token: 'rt' }, user: { id: 'uid' } }, error: null });
    queueResult('profiles', { data: adminRow, error: null });

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'admin@toolsja.test', password: 'pw' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'admin', email: 'admin@toolsja.test' });
    expect(JSON.stringify(res.body)).not.toMatch(/access_token|refresh_token/);

    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.find((c) => c.startsWith('sw_at'))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('sw_rt'))).toMatch(/HttpOnly/i);
    const csrf = cookies.find((c) => c.startsWith('sw_csrf'));
    expect(csrf).toBeTruthy();
    expect(csrf).not.toMatch(/HttpOnly/i); // readable for double-submit
  });
});
