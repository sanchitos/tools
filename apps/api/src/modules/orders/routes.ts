import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { orderRateLimit } from '../../middleware/rateLimit.js';
import { optionalAuth } from '../../middleware/auth.js';
import { createOrderSchema } from './schema.js';
import { createOrder } from './service.js';

/**
 * Public checkout endpoint. `optionalAuth` never blocks: a guest checks out
 * exactly as before (user_id NULL), and a signed-in shopper's order is stamped
 * with their id so it shows up under /account.
 * POST-only, and deliberately no GET /:id: order numbers are sequential and
 * guessable, so a public lookup would leak customer names/phones/addresses.
 * Rate-limited tighter than browsing (see rateLimit.ts) since this is an
 * unauthenticated write.
 */
export function ordersRouter(): Router {
  const router = Router();
  router.use(orderRateLimit);

  router.post(
    '/',
    optionalAuth,
    validate({ body: createOrderSchema }),
    ah(async (req, res) => {
      const order = await createOrder(req.body, req.user?.id ?? null);
      res.status(201).json(order);
    }),
  );

  return router;
}
