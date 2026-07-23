import { Router } from 'express';
import multer from 'multer';
import { ah, AppError } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  brandCreateSchema,
  brandUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  idParamSchema,
  imageParamsSchema,
  imageUploadMetaSchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  reorderSchema,
} from './schema.js';
import * as svc from './service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

/**
 * Admin back-office API. The whole router is gated by requireAuth +
 * requireRole('admin'); the global CSRF guard already protects every mutation.
 * Handlers stay thin — zod validates, the service does the work.
 */
export function adminRouter(): Router {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  // --- Products ------------------------------------------------------------
  router.get(
    '/products',
    ah(async (req, res) => {
      res.json(await svc.listAdminProducts(productListQuerySchema.parse(req.query)));
    }),
  );

  router.post(
    '/products',
    validate({ body: productCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createProduct(req.body));
    }),
  );

  router.get(
    '/products/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.getAdminProduct(id));
    }),
  );

  router.patch(
    '/products/:id',
    validate({ body: productUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateProduct(id, req.body));
    }),
  );

  router.delete(
    '/products/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      await svc.deleteProduct(id);
      res.status(204).end();
    }),
  );

  // --- Product images ------------------------------------------------------
  // (reorder registered before :imageId patterns)
  router.patch(
    '/products/:id/images/reorder',
    validate({ body: reorderSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.reorderImages(id, req.body));
    }),
  );

  router.post(
    '/products/:id/images',
    upload.single('file'),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      const file = req.file;
      if (!file) throw AppError.BadRequest('No file uploaded (field "file")');
      if (!file.mimetype.startsWith('image/')) {
        throw AppError.BadRequest('Only image uploads are allowed');
      }
      const meta = imageUploadMetaSchema.parse(req.body ?? {});
      res.status(201).json(await svc.addProductImage(id, file, meta));
    }),
  );

  router.patch(
    '/products/:id/images/:imageId/primary',
    ah(async (req, res) => {
      const { id, imageId } = imageParamsSchema.parse(req.params);
      res.json(await svc.setPrimaryImage(id, imageId));
    }),
  );

  router.delete(
    '/products/:id/images/:imageId',
    ah(async (req, res) => {
      const { id, imageId } = imageParamsSchema.parse(req.params);
      await svc.deleteProductImage(id, imageId);
      res.status(204).end();
    }),
  );

  // --- Categories ----------------------------------------------------------
  router.get(
    '/categories',
    ah(async (_req, res) => {
      res.json(await svc.listAdminCategories());
    }),
  );

  router.post(
    '/categories',
    validate({ body: categoryCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createCategory(req.body));
    }),
  );

  router.patch(
    '/categories/:id',
    validate({ body: categoryUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateCategory(id, req.body));
    }),
  );

  router.delete(
    '/categories/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      await svc.deleteCategory(id);
      res.status(204).end();
    }),
  );

  // --- Brands --------------------------------------------------------------
  router.get(
    '/brands',
    ah(async (_req, res) => {
      res.json(await svc.listAdminBrands());
    }),
  );

  router.post(
    '/brands',
    validate({ body: brandCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createBrand(req.body));
    }),
  );

  router.patch(
    '/brands/:id',
    validate({ body: brandUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateBrand(id, req.body));
    }),
  );

  router.delete(
    '/brands/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      await svc.deleteBrand(id);
      res.status(204).end();
    }),
  );

  // --- Storage maintenance -------------------------------------------------
  router.post(
    '/images/cleanup-orphans',
    ah(async (_req, res) => {
      res.json(await svc.cleanupOrphans());
    }),
  );

  return router;
}
