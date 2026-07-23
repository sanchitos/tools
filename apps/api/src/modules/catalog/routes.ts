import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { productListQuerySchema, slugParamSchema } from './schema.js';
import {
  getFeatured,
  getProductBySlug,
  listBrands,
  listCategories,
  listProducts,
} from './service.js';

/**
 * Public catalog reads (no auth). Handlers are thin: parse+validate with zod
 * (ZodError -> 400 via the central errorHandler), delegate to the service, and
 * return DTOs. `/products/featured` is registered BEFORE `/products/:slug` so the
 * literal path isn't captured as a slug.
 */
export function catalogRouter(): Router {
  const router = Router();

  router.get(
    '/products/featured',
    ah(async (_req, res) => {
      res.json(await getFeatured());
    }),
  );

  router.get(
    '/products',
    ah(async (req, res) => {
      const params = productListQuerySchema.parse(req.query);
      res.json(await listProducts(params));
    }),
  );

  router.get(
    '/products/:slug',
    ah(async (req, res) => {
      const { slug } = slugParamSchema.parse(req.params);
      res.json(await getProductBySlug(slug));
    }),
  );

  router.get(
    '/categories',
    ah(async (_req, res) => {
      res.json(await listCategories());
    }),
  );

  router.get(
    '/brands',
    ah(async (_req, res) => {
      res.json(await listBrands());
    }),
  );

  return router;
}
