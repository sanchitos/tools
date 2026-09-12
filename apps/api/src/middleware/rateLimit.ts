import rateLimit from 'express-rate-limit';
import { isTest } from '../config/env.js';

/**
 * Rate limiter for the auth surface (login/refresh). Kept lax in test so the
 * suite doesn't trip it. `trust proxy` (set in app.ts) makes client IPs correct
 * behind Railway.
 */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isTest ? 1000 : 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' },
  },
});

/**
 * Rate limiter for the public catalog (GET /products etc). It had none
 * before `q` started hitting the search_products RPC (0005_search.sql),
 * which made an unlimited endpoint a cheap amplification target. Looser
 * than the auth limiter since this is normal browsing traffic, not a
 * credentialed action.
 */
export const catalogRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' },
  },
});

/**
 * Rate limiter for the machine-to-machine agent surface (/api/v1/agent). All
 * n8n traffic arrives from one IP, so a per-IP limit is effectively global
 * for this route — sized for a chat agent's call volume, not browsing.
 */
export const agentRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isTest ? 1000 : 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly' },
  },
});

/**
 * Rate limiter for POST /orders. Unlike catalog reads this is an
 * unauthenticated *write* (the storefront cart has no login), so it gets a
 * much tighter budget than browsing traffic — sized for a genuine shopper
 * checking out a few times an hour, not for probing.
 */
export const orderRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many orders submitted, try again later' },
  },
});

/**
 * Rate limiter for the signup surface (/auth/signup, /auth/resend-confirmation).
 * Each request creates a GoTrue user or sends an email on our Resend quota, so
 * it gets the order-endpoint budget (an hour window, single-digit limit) rather
 * than the auth limiter's 20-per-15-minutes, which is sized for someone
 * retyping a password.
 */
export const signupRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' },
  },
});
