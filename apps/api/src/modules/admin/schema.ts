import { z } from 'zod';

const uuid = z.string().uuid();
const nullableStr = z.string().trim().max(4000).nullable();

export const idParamSchema = z.object({ id: uuid });
export const imageParamsSchema = z.object({ id: uuid, imageId: uuid });

// --- Products --------------------------------------------------------------

const specInput = z.object({
  label: z.string().trim().min(1).max(200),
  value: z.string().trim().min(1).max(1000),
  sortOrder: z.number().int().nonnegative().optional(),
});

const highlightInput = z.object({
  text: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  slug: z.string().trim().min(1).max(200).optional(),
  categoryId: uuid,
  brandId: uuid.nullable().optional(),
  shortDescription: nullableStr.optional(),
  description: nullableStr.optional(),
  price: z.number().nonnegative(),
  stock: z.number().int().nonnegative().default(0),
  sku: z.string().trim().min(1).max(120).nullable().optional(),
  featured: z.boolean().default(false),
  isPublished: z.boolean().default(true),
  specs: z.array(specInput).max(100).optional(),
  highlights: z.array(highlightInput).max(100).optional(),
});

export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    slug: z.string().trim().min(1).max(200),
    categoryId: uuid,
    brandId: uuid.nullable(),
    shortDescription: nullableStr,
    description: nullableStr,
    price: z.number().nonnegative(),
    stock: z.number().int().nonnegative(),
    sku: z.string().trim().min(1).max(120).nullable(),
    featured: z.boolean(),
    isPublished: z.boolean(),
    specs: z.array(specInput).max(100),
    highlights: z.array(highlightInput).max(100),
  })
  .partial();

export const productListQuerySchema = z.object({
  q: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).optional(),
  published: z.preprocess(
    (v) => (v === undefined ? undefined : v === 'true'),
    z.boolean().optional(),
  ),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type ProductCreate = z.infer<typeof productCreateSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type AdminProductListQuery = z.infer<typeof productListQuerySchema>;

// --- Images ----------------------------------------------------------------

/** Multipart text fields arrive as strings; coerce them. */
export const imageUploadMetaSchema = z.object({
  altText: z.string().trim().max(500).optional(),
  isPrimary: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
});

export const reorderSchema = z.object({
  items: z
    .array(z.object({ id: uuid, sortOrder: z.number().int().nonnegative() }))
    .min(1)
    .max(100),
});

export type ImageUploadMeta = z.infer<typeof imageUploadMetaSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;

// --- Categories ------------------------------------------------------------

export const categoryCreateSchema = z.object({
  label: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().default(true),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

// --- Brands ----------------------------------------------------------------

export const brandCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export const brandUpdateSchema = brandCreateSchema.partial();

export type BrandCreate = z.infer<typeof brandCreateSchema>;
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;
