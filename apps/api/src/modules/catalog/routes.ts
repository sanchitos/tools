import { Router } from 'express';
import { ah } from '../../lib/errors.js';
import { catalogRateLimit } from '../../middleware/rateLimit.js';
import { langQuerySchema, productListQuerySchema, slugParamSchema } from './schema.js';
import {
  getFeatured,
  getProductBySlug,
  listBrands,
  listCategories,
  listProducts,
} from './service.js';
import { getHomeContent, listFeaturedBrands, listLocations } from './homeService.js';

/**
 * Public catalog reads (no auth). Handlers are thin: parse+validate with zod
 * (ZodError -> 400 via the central errorHandler), delegate to the service, and
 * return DTOs. `/products/featured` is registered BEFORE `/products/:slug` so the
 * literal path isn't captured as a slug; `/brands/featured` follows the same
 * precedent, ahead of any future `/brands/:slug`.
 */
export function catalogRouter(): Router {
  const router = Router();
  router.use(catalogRateLimit);

  router.get(
    '/products/featured',
    ah(async (req, res) => {
      const { lang } = langQuerySchema.parse(req.query);
      res.json(await getFeatured(lang));
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
      const { lang } = langQuerySchema.parse(req.query);
      res.json(await getProductBySlug(slug, lang));
    }),
  );

  router.get(
    '/categories',
    ah(async (req, res) => {
      const { lang } = langQuerySchema.parse(req.query);
      res.json(await listCategories(lang));
    }),
  );

  router.get(
    '/brands/featured',
    ah(async (_req, res) => {
      res.json(await listFeaturedBrands());
    }),
  );

  router.get(
    '/brands',
    ah(async (_req, res) => {
      res.json(await listBrands());
    }),
  );

  // Admin-editable homepage content (0010_homepage_content.sql).
  router.get(
    '/home',
    ah(async (req, res) => {
      const { lang } = langQuerySchema.parse(req.query);
      res.json(await getHomeContent(lang));
    }),
  );

  router.get(
    '/locations',
    ah(async (req, res) => {
      const { lang } = langQuerySchema.parse(req.query);
      res.json(await listLocations(lang));
    }),
  );

  return router;
}
