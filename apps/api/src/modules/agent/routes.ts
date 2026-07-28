import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { requireAgentKey } from '../../middleware/agentAuth.js';
import { agentRateLimit } from '../../middleware/rateLimit.js';
import { agentSearchQuerySchema } from './schema.js';
import { searchProductsForAgent } from './service.js';

/**
 * Machine-to-machine catalog search (the n8n WhatsApp agent's SearchProducts
 * tool). GET-only by design: middleware/csrf.ts short-circuits on
 * SAFE_METHODS before touching cookies, so no CSRF exemption is strictly
 * needed — app.ts still lists this path in CSRF_EXEMPT defensively, so a
 * future POST here fails as an auth error, not a CSRF error nobody traces.
 * Auth is `requireAgentKey` (Bearer, not a cookie); rate limit is its own
 * bucket since all n8n traffic arrives from one IP.
 */
export function agentRouter(): Router {
  const router = Router();
  router.use(agentRateLimit);
  router.use(requireAgentKey);

  router.get(
    '/products/search',
    ah(async (req, res) => {
      const params = agentSearchQuerySchema.parse(req.query);
      res.json(await searchProductsForAgent(params));
    }),
  );

  return router;
}
