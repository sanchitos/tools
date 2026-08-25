import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { orderRateLimit } from '../../middleware/rateLimit.js';
import { createOrderSchema } from './schema.js';
import { createOrder } from './service.js';

/**
 * Public checkout endpoint (no auth — the storefront cart is a guest cart).
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
    validate({ body: createOrderSchema }),
    ah(async (req, res) => {
      const order = await createOrder(req.body);
      res.status(201).json(order);
    }),
  );

  return router;
}
