import crypto from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { isProd } from '../config/env.js';

/**
 * Cookie names for the cookie-proxied session. `sw_` prefix carried over from
 * SolarWorld. Access + refresh are httpOnly + signed (the browser can neither
 * read nor forge them); the CSRF token is readable so the SPA can echo it back
 * for double-submit validation.
 */
export const COOKIE = {
  accessToken: 'sw_at',
  refreshToken: 'sw_rt',
  csrf: 'sw_csrf',
} as const;

export const CSRF_HEADER = 'x-csrf-token';

export const ACCESS_MAX_AGE_MS = 60 * 60 * 1000; // ~1h
export const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30d

const base: CookieOptions = {
  secure: isProd,
  sameSite: 'strict',
  path: '/',
};

/** Options for the httpOnly, signed session cookies (access + refresh). */
export function sessionCookieOpts(maxAgeMs: number): CookieOptions {
  return { ...base, httpOnly: true, signed: true, maxAge: maxAgeMs };
}

/** Options for the readable CSRF cookie (not httpOnly, not signed). */
export function csrfCookieOpts(maxAgeMs: number): CookieOptions {
  return { ...base, httpOnly: false, signed: false, maxAge: maxAgeMs };
}

export function newCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Write the full session: signed httpOnly access + refresh cookies, plus a fresh
 * readable CSRF token. Called on login and on every refresh (token rotation).
 */
export function setSession(res: Response, tokens: SessionTokens): string {
  res.cookie(COOKIE.accessToken, tokens.accessToken, sessionCookieOpts(ACCESS_MAX_AGE_MS));
  res.cookie(COOKIE.refreshToken, tokens.refreshToken, sessionCookieOpts(REFRESH_MAX_AGE_MS));
  const csrf = newCsrfToken();
  res.cookie(COOKIE.csrf, csrf, csrfCookieOpts(REFRESH_MAX_AGE_MS));
  return csrf;
}

/** Clear every session cookie (logout, or failed refresh). */
export function clearSession(res: Response): void {
  const opts: CookieOptions = { ...base };
  res.clearCookie(COOKIE.accessToken, opts);
  res.clearCookie(COOKIE.refreshToken, opts);
  res.clearCookie(COOKIE.csrf, opts);
}
