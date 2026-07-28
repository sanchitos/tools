import { z } from 'zod';

/** A query param that may appear 0..n times -> normalized to string[] | undefined. */
const stringArray = z.preprocess(
  (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
  z.array(z.string().min(1)).optional(),
);

const boolParam = z.preprocess(
  (v) => (v === undefined ? undefined : v === 'true' || v === true),
  z.boolean().optional(),
);

/** Shop-page product list query (§6). Coerces + validates raw req.query. */
export const productListQuerySchema = z.object({
  category: stringArray,
  brand: stringArray,
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: boolParam,
  q: z.string().trim().min(1).max(120).optional(),
  // No .default() here: the service must distinguish "user chose Featured"
  // from "sent nothing" so it can default an unset sort to 'relevance' when
  // `q` is present, without overriding an explicit choice.
  sort: z.enum(['featured', 'price-asc', 'price-desc', 'name', 'relevance']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(24),
});

export type ProductListParams = z.infer<typeof productListQuerySchema>;

export const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(200),
});
