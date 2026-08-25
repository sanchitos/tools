import { Router } from 'express';
import { catalogRouter } from './modules/catalog/routes.js';
import { authRouter } from './modules/auth/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { agentRouter } from './modules/agent/routes.js';
import { ordersRouter } from './modules/orders/routes.js';

/**
 * Mounts every module router under /api/v1. Module routers are added as each
 * step lands:
 *   - catalog  (public reads)          — step 4 ✓
 *   - auth     (admin login/refresh)   — step 5 ✓
 *   - admin    (role-gated CRUD)       — step 6 ✓
 *   - agent    (machine-to-machine search, Bearer-keyed) — step 7 ✓
 *   - orders   (guest checkout, public POST-only) — cart phase ✓
 */
export function apiRouter(): Router {
  const router = Router();

  router.use('/', catalogRouter());
  router.use('/auth', authRouter());
  router.use('/admin', adminRouter());
  router.use('/agent', agentRouter());
  router.use('/orders', ordersRouter());

  return router;
}
