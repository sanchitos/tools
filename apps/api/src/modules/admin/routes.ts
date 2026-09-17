import { Router } from 'express';
import multer from 'multer';
import { ah, AppError } from '../../lib/errors.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import {
  adminOrderListQuerySchema,
  brandCreateSchema,
  brandUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
  heroUpdateSchema,
  idParamSchema,
  imageParamsSchema,
  imageUploadMetaSchema,
  locationCreateSchema,
  locationUpdateSchema,
  orphanCleanupQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
  reorderSchema,
  tileCreateSchema,
  tileUpdateSchema,
  updateOrderStatusSchema,
  userCreateSchema,
  userListQuerySchema,
  userUpdateSchema,
} from './schema.js';
import * as svc from './service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
});

/** Shared multipart guard — every upload route below applies the same checks. */
function requireImage(req: { file?: Express.Multer.File }): Express.Multer.File {
  const file = req.file;
  if (!file) throw AppError.BadRequest('No file uploaded (field "file")');
  if (!file.mimetype.startsWith('image/')) {
    throw AppError.BadRequest('Only image uploads are allowed');
  }
  return file;
}

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
      const file = requireImage(req);
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

  // Serves subcategories too — they are rows in the same table (0007/0013).
  router.post(
    '/categories/:id/image',
    upload.single('file'),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.setCategoryImage(id, requireImage(req)));
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

  router.post(
    '/brands/:id/logo',
    upload.single('file'),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.setBrandLogo(id, requireImage(req)));
    }),
  );

  // --- Homepage ------------------------------------------------------------
  router.get(
    '/home',
    ah(async (_req, res) => {
      res.json(await svc.getAdminHomeContent());
    }),
  );

  router.patch(
    '/home/hero',
    validate({ body: heroUpdateSchema }),
    ah(async (req, res) => {
      res.json(await svc.updateHero(req.body));
    }),
  );

  router.post(
    '/home/hero/image',
    upload.single('file'),
    ah(async (req, res) => {
      res.json(await svc.setHeroImage(requireImage(req)));
    }),
  );

  router.post(
    '/home/tiles',
    validate({ body: tileCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createTile(req.body));
    }),
  );

  router.patch(
    '/home/tiles/:id',
    validate({ body: tileUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateTile(id, req.body));
    }),
  );

  router.delete(
    '/home/tiles/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      await svc.deleteTile(id);
      res.status(204).end();
    }),
  );

  router.post(
    '/home/tiles/:id/image',
    upload.single('file'),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.setTileImage(id, requireImage(req)));
    }),
  );

  // --- Locations -----------------------------------------------------------
  router.get(
    '/locations',
    ah(async (_req, res) => {
      res.json(await svc.listAdminLocations());
    }),
  );

  router.post(
    '/locations',
    validate({ body: locationCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createLocation(req.body));
    }),
  );

  router.patch(
    '/locations/:id',
    validate({ body: locationUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateLocation(id, req.body));
    }),
  );

  router.delete(
    '/locations/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      await svc.deleteLocation(id);
      res.status(204).end();
    }),
  );

  router.post(
    '/locations/:id/image',
    upload.single('file'),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.setLocationImage(id, requireImage(req)));
    }),
  );

  // --- Users ---------------------------------------------------------------
  router.get(
    '/users',
    ah(async (req, res) => {
      res.json(await svc.listAdminUsers(userListQuerySchema.parse(req.query)));
    }),
  );

  router.post(
    '/users',
    validate({ body: userCreateSchema }),
    ah(async (req, res) => {
      res.status(201).json(await svc.createUser(req.body));
    }),
  );

  router.patch(
    '/users/:id',
    validate({ body: userUpdateSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      // The only self-change this endpoint can make is a deactivation (you are
      // active by definition if you got here), and locking the last admin out
      // of their own back office is not a mistake worth allowing.
      if (id === req.user!.id) throw AppError.Conflict('You cannot deactivate your own account.');
      res.json(await svc.setUserActive(id, (req.body as { isActive: boolean }).isActive));
    }),
  );

  // --- Storage maintenance -------------------------------------------------
  router.post(
    '/images/cleanup-orphans',
    ah(async (req, res) => {
      const { dryRun } = orphanCleanupQuerySchema.parse(req.query);
      res.json(await svc.cleanupOrphans(dryRun === true));
    }),
  );

  // --- Orders (read + status only — creation is the public checkout route) -
  router.get(
    '/orders',
    ah(async (req, res) => {
      res.json(await svc.listAdminOrders(adminOrderListQuerySchema.parse(req.query)));
    }),
  );

  router.get(
    '/orders/:id',
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.getAdminOrder(id));
    }),
  );

  router.patch(
    '/orders/:id',
    validate({ body: updateOrderStatusSchema }),
    ah(async (req, res) => {
      const { id } = idParamSchema.parse(req.params);
      res.json(await svc.updateOrderStatus(id, req.body.status));
    }),
  );

  return router;
}
