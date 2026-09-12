import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));
// Mocked at the module boundary: the real one would POST to api.resend.com.
vi.mock('../src/lib/email.js', () => ({
  sendEmail: vi.fn(async () => true),
  sendConfirmationEmail: vi.fn(async () => undefined),
}));

import { createApp } from '../src/app.js';
import { sendConfirmationEmail } from '../src/lib/email.js';
import {
  queueResult,
  resetMocks,
  setGenerateLink,
  setSignIn,
  setVerifyOtp,
} from './helpers/mockSupabase.js';

const app = createApp();

const adminRow = {
  id: 'uid', email: 'admin@toolsja.test', full_name: 'Admin', role: 'admin',
  is_active: true, created_at: '', updated_at: '',
};

const customerRow = {
  id: 'cid', email: 'shopper@toolsja.test', full_name: 'Shopper', role: 'customer',
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

  it('POST /auth/login reports an unconfirmed email as 403 EMAIL_NOT_CONFIRMED', async () => {
    // Not 401 "invalid email or password": the password was right, the link
    // just hasn't been clicked. The SPA keys off this code to offer a resend.
    setSignIn({ data: { session: null, user: null }, error: { code: 'email_not_confirmed', message: 'Email not confirmed' } });
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'shopper@toolsja.test', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_CONFIRMED');
  });

  // --- Signup ---------------------------------------------------------------

  it('POST /auth/signup rejects an invalid body (400)', async () => {
    const res = await request(app).post('/api/v1/auth/signup').send({ email: 'nope' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/signup rejects a password under 8 characters (400)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'shopper@toolsja.test', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/signup sends the confirmation email and sets NO cookies', async () => {
    setGenerateLink({ data: { properties: { hashed_token: 'tok-123' } }, error: null });

    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'shopper@toolsja.test', password: 'password123', fullName: 'Shopper' });

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ status: 'confirmation_sent', email: 'shopper@toolsja.test' });
    // Signup does not sign you in — the account is unconfirmed.
    expect(res.headers['set-cookie']).toBeUndefined();

    expect(sendConfirmationEmail).toHaveBeenCalledTimes(1);
    const [to, link] = vi.mocked(sendConfirmationEmail).mock.calls[0]!;
    expect(to).toBe('shopper@toolsja.test');
    expect(link).toContain('/auth/confirm?token=tok-123&type=signup');
  });

  it('POST /auth/signup returns 409 for an address that is already registered', async () => {
    setGenerateLink({ data: null, error: { message: 'A user with this email address has already been registered' } });
    const res = await request(app)
      .post('/api/v1/auth/signup')
      .send({ email: 'shopper@toolsja.test', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  // --- Confirmation ---------------------------------------------------------

  it('POST /auth/confirm turns the emailed token into a session', async () => {
    setVerifyOtp({ data: { session: { access_token: 'at', refresh_token: 'rt' }, user: { id: 'cid' } }, error: null });
    queueResult('profiles', { data: customerRow, error: null });

    const res = await request(app).post('/api/v1/auth/confirm').send({ token: 'tok-123' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: 'customer', email: 'shopper@toolsja.test' });

    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(cookies.find((c) => c.startsWith('sw_at'))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('sw_rt'))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith('sw_csrf'))).not.toMatch(/HttpOnly/i);
  });

  it('POST /auth/confirm rejects an invalid or expired token (400)', async () => {
    setVerifyOtp({ data: { session: null, user: null }, error: { message: 'Token has expired' } });
    const res = await request(app).post('/api/v1/auth/confirm').send({ token: 'stale' });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('POST /auth/resend-confirmation always answers 204', async () => {
    // Deliberately no generateLink result queued — an unknown address must be
    // indistinguishable from a known one.
    setGenerateLink({ data: null, error: { message: 'User not found' } });
    const res = await request(app)
      .post('/api/v1/auth/resend-confirmation')
      .send({ email: 'nobody@toolsja.test' });
    expect(res.status).toBe(204);
  });
});
