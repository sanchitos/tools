import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { requireAuth } from '../../middleware/auth.js';
import { listUserOrders } from '../orders/service.js';

/**
 * The signed-in shopper's own surface. Every route is behind requireAuth and
 * scoped to `req.user` — nothing here takes a user id from the caller.
 *
 * A separate module rather than routes on ordersRouter because that router
 * carries a router-level orderRateLimit of 10/hour: correct for *placing*
 * orders, wrong for reading a history page.
 */
export function accountRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get(
    '/orders',
    ah(async (req, res) => {
      res.json(await listUserOrders(req.user!.id));
    }),
  );

  return router;
}
