import type { RequestHandler } from 'express';
import { COOKIE, CSRF_HEADER } from '../lib/cookies.js';
import { AppError } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit CSRF guard. On any state-changing method the readable `sw_csrf`
 * cookie must match the `x-csrf-token` header. Safe methods pass through.
 *
 * Login/refresh are exempt (allowlisted at mount time) because they bootstrap or
 * rotate the token itself and are additionally protected by the auth rate limit.
 */
export function csrfProtection(exemptPaths: string[] = []): RequestHandler {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (exemptPaths.some((p) => req.path === p || req.path.startsWith(p))) {
      return next();
    }

    const cookieToken = req.cookies?.[COOKIE.csrf];
    const headerToken = req.get(CSRF_HEADER);

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return next(AppError.Forbidden('Invalid or missing CSRF token'));
    }
    next();
  };
}
