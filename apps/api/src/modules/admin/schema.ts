import { z } from 'zod';

// The admin orders endpoints validate with the same schemas the public
// checkout route uses — re-exported here so admin/routes.ts can import
// everything it needs from this one module, like every other section below.
export { adminOrderListQuerySchema, updateOrderStatusSchema } from '../orders/schema.js';

const uuid = z.string().uuid();
const nullableStr = z.string().trim().max(4000).nullable();

/**
 * A Spanish sibling field. Blank -> null, ALWAYS: `''` is not a translation,
 * and `row.name_es ?? row.name` on an empty string would render a blank product
 * name on the storefront. Guarded at both ends — here on write, and by pick()
 * in lib/locale.ts on read.
 */
const esText = z
  .string()
  .trim()
  .max(4000)
  .nullable()
  .optional()
  .transform((v) => (v && v.length ? v : null));

export const idParamSchema = z.object({ id: uuid });
export const imageParamsSchema = z.object({ id: uuid, imageId: uuid });

// --- Products --------------------------------------------------------------

const specInput = z.object({
  label: z.string().trim().min(1).max(200),
  labelEs: esText,
  value: z.string().trim().min(1).max(1000),
  valueEs: esText,
  sortOrder: z.number().int().nonnegative().optional(),
});

const highlightInput = z.object({
  text: z.string().trim().min(1).max(500),
  textEs: esText,
  sortOrder: z.number().int().nonnegative().optional(),
});

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(300),
  nameEs: esText,
  slug: z.string().trim().min(1).max(200).optional(),
  categoryId: uuid,
  brandId: uuid.nullable().optional(),
  shortDescription: nullableStr.optional(),
  shortDescriptionEs: esText,
  description: nullableStr.optional(),
  descriptionEs: esText,
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
    nameEs: esText,
    slug: z.string().trim().min(1).max(200),
    categoryId: uuid,
    brandId: uuid.nullable(),
    shortDescription: nullableStr,
    shortDescriptionEs: esText,
    description: nullableStr,
    descriptionEs: esText,
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
  labelEs: esText,
  slug: z.string().trim().min(1).max(120).optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().default(true),
  /** Top-level when omitted/null. A parent cannot itself have a parent (2 levels max). */
  parentId: uuid.nullable().optional(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

// --- Brands ----------------------------------------------------------------

export const brandCreateSchema = z.object({
  // No `nameEs`: brand names are proper nouns and registered trademarks, and
  // `slug` is the URL-facing filter facet (see 0009_i18n_content.sql).
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).optional(),
  logoUrl: z.string().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  /** Shown in the homepage brand rail. Inherited by brandUpdateSchema via .partial(). */
  isFeatured: z.boolean().default(false),
});

export const brandUpdateSchema = brandCreateSchema.partial();

export type BrandCreate = z.infer<typeof brandCreateSchema>;
export type BrandUpdate = z.infer<typeof brandUpdateSchema>;

// --- Homepage content ------------------------------------------------------

/**
 * Mirrors `IconName` in apps/web/src/components/ui/Icon.tsx. The DB column is
 * plain `text` because IconName is a *web* type Postgres can't see, so this
 * literal union is the validation boundary — and the admin control is a Select
 * of these values, never free text. Keep in step with Icon.tsx.
 */
export const ICON_NAMES = [
  'search', 'menu', 'close', 'chevronDown', 'chevronUp', 'chevronLeft', 'chevronRight',
  'cart', 'user', 'phone', 'whatsapp', 'star', 'starHalf', 'filter', 'sort', 'grid',
  'truck', 'shield', 'tag', 'check', 'arrowRight', 'headset', 'pin', 'wrench',
] as const;

const iconName = z.enum(ICON_NAMES).nullable().optional();
const href = z.string().trim().max(2000).nullable().optional();

export const heroUpdateSchema = z
  .object({
    eyebrow: nullableStr,
    eyebrowEs: esText,
    headline: z.string().trim().min(1).max(300),
    headlineEs: esText,
    subcopy: nullableStr,
    subcopyEs: esText,
    ctaLabel: z.string().trim().max(120).nullable(),
    ctaLabelEs: esText,
    ctaHref: z.string().trim().min(1).max(2000),
    imageUrl: z.string().url().max(2000).nullable(),
  })
  .partial();

export const tileCreateSchema = z.object({
  slot: z.enum(['promo', 'service', 'ticker']),
  title: z.string().trim().min(1).max(200),
  titleEs: esText,
  body: nullableStr.optional(),
  bodyEs: esText,
  icon: iconName,
  imageUrl: z.string().url().max(2000).nullable().optional(),
  href,
  sortOrder: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().default(true),
});

export const tileUpdateSchema = tileCreateSchema.partial();

export type HeroUpdate = z.infer<typeof heroUpdateSchema>;
export type TileCreate = z.infer<typeof tileCreateSchema>;
export type TileUpdate = z.infer<typeof tileUpdateSchema>;

// --- Store locations -------------------------------------------------------

export const locationCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  nameEs: esText,
  /** Not translated — an address is an address. */
  address: z.string().trim().min(1).max(500),
  phone: z.string().trim().max(60).nullable().optional(),
  hours: z.string().trim().max(300).nullable().optional(),
  hoursEs: esText,
  mapUrl: z.string().url().max(2000).nullable().optional(),
  imageUrl: z.string().url().max(2000).nullable().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
  isPublished: z.boolean().default(true),
});

export const locationUpdateSchema = locationCreateSchema.partial();

export type LocationCreate = z.infer<typeof locationCreateSchema>;
export type LocationUpdate = z.infer<typeof locationUpdateSchema>;

// --- Storage maintenance ---------------------------------------------------

/** `?dryRun=true` resolves the orphan list without deleting anything. */
export const orphanCleanupQuerySchema = z.object({
  dryRun: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()),
});

// --- Users -----------------------------------------------------------------

const role = z.enum(['admin', 'customer']);

export const userListQuerySchema = z.object({
  /** Matched against email OR full_name. */
  q: z.string().trim().min(1).max(160).optional(),
  role: role.optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * Admin-created accounts are pre-confirmed (no email is sent) and the admin
 * hands the password over out of band — hence a required password here, unlike
 * the public signup flow.
 */
export const userCreateSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120).optional(),
  role: role.default('customer'),
});

/**
 * Activate/deactivate only. Role changes, password resets and hard deletes are
 * deliberately not here yet: each needs its own thinking about what happens to
 * a live session, and deactivation already covers "stop this person now".
 */
export const userUpdateSchema = z.object({ isActive: z.boolean() });

export type AdminUserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreate = z.infer<typeof userCreateSchema>;
export type UserUpdate = z.infer<typeof userUpdateSchema>;
