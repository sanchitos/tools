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
