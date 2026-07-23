import { Router } from 'express';
import { ah, AppError } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { authRateLimit } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';
import { COOKIE, clearSession, setSession } from '../../lib/cookies.js';
import { loginSchema } from './schema.js';
import { loginWithPassword, refreshTokens } from './service.js';

/**
 * Cookie-proxied auth. The browser never sees a token — Express keeps the session
 * in signed httpOnly cookies and returns only the profile. `/login` and
 * `/refresh` are CSRF-exempt (they bootstrap/rotate the CSRF token) and rate-
 * limited; `/logout` requires the CSRF token like any other mutation.
 */
export function authRouter(): Router {
  const router = Router();

  router.post(
    '/login',
    authRateLimit,
    validate({ body: loginSchema }),
    ah(async (req, res) => {
      const { email, password } = req.body as { email: string; password: string };
      const { profile, tokens } = await loginWithPassword(email, password);
      setSession(res, tokens);
      res.json(profile);
    }),
  );

  router.post(
    '/refresh',
    authRateLimit,
    ah(async (req, res) => {
      const refreshToken = req.signedCookies?.[COOKIE.refreshToken] as string | undefined;
      if (!refreshToken) throw AppError.Unauthorized('No session');
      try {
        const { profile, tokens } = await refreshTokens(refreshToken);
        setSession(res, tokens);
        res.json(profile);
      } catch (err) {
        clearSession(res);
        throw err;
      }
    }),
  );

  router.post(
    '/logout',
    ah(async (_req, res) => {
      clearSession(res);
      res.status(204).end();
    }),
  );

  router.get(
    '/me',
    requireAuth,
    ah(async (req, res) => {
      res.json(req.user);
    }),
  );

  return router;
}
