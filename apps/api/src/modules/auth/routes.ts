import { Router } from 'express';
import { ah, AppError } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { authRateLimit, signupRateLimit } from '../../middleware/rateLimit.js';
import { requireAuth } from '../../middleware/auth.js';
import { COOKIE, clearSession, setSession } from '../../lib/cookies.js';
import { confirmSchema, loginSchema, resendConfirmationSchema, signupSchema } from './schema.js';
import {
  confirmSignup,
  loginWithPassword,
  refreshTokens,
  resendConfirmation,
  signupWithPassword,
} from './service.js';

/**
 * Cookie-proxied auth. The browser never sees a token — Express keeps the session
 * in signed httpOnly cookies and returns only the profile. `/login`, `/refresh`
 * and the three signup routes are CSRF-exempt (they bootstrap/rotate the CSRF
 * token, and a guest has no `sw_csrf` cookie to double-submit in the first
 * place) and rate-limited; `/logout` requires the CSRF token like any other
 * mutation. The exemptions are listed path-by-path in app.ts.
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

  /**
   * 202, not 200 + a session: signup creates an UNCONFIRMED account and sends a
   * link. Nothing is set on the response — the caller is not signed in yet.
   */
  router.post(
    '/signup',
    signupRateLimit,
    validate({ body: signupSchema }),
    ah(async (req, res) => {
      res.status(202).json(await signupWithPassword(req.body));
    }),
  );

  /** Exchanges the emailed token for the session cookies (the SPA POSTs it). */
  router.post(
    '/confirm',
    authRateLimit,
    validate({ body: confirmSchema }),
    ah(async (req, res) => {
      const { token, type } = req.body as { token: string; type: 'signup' | 'magiclink' };
      const { profile, tokens } = await confirmSignup(token, type);
      setSession(res, tokens);
      res.json(profile);
    }),
  );

  /** Always 204, whatever happened — see resendConfirmation() in service.ts. */
  router.post(
    '/resend-confirmation',
    signupRateLimit,
    validate({ body: resendConfirmationSchema }),
    ah(async (req, res) => {
      await resendConfirmation((req.body as { email: string }).email);
      res.status(204).end();
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
