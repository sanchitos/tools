import type {
  BrandDTO,
  CategoryDTO,
  Paginated,
  ProductDetailDTO,
  ProductSummaryDTO,
} from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import type { BrandRow, CategoryRow } from '../../types/db.js';
import type { ProductListParams } from './schema.js';
import {
  toBrandDTO,
  toCategoryDTO,
  toProductDetailDTO,
  toProductSummaryDTO,
  type ProductDetailRelations,
  type ProductWithRelations,
} from './mappers.js';

/** Columns + embedded relations for a product summary/detail row. */
const PRODUCT_SELECT = `
  id, slug, name, brand_id, category_id, short_description, description,
  price, currency, stock, sku, featured, is_published, rating, review_count,
  created_at, updated_at,
  brand:brands ( id, name, slug, logo_url ),
  category:categories ( id, slug, label ),
  images:product_images ( id, product_id, url, is_primary, alt_text, sort_order, created_at )
`;

function fail(message: string, details?: unknown): never {
  throw AppError.Internal(message, details);
}

/** Resolve category/brand slugs to ids. Unknown slugs yield an empty match set. */
async function idsForSlugs(table: 'categories' | 'brands', slugs: string[]): Promise<string[]> {
  const { data, error } = await db.from(table).select('id').in('slug', slugs);
  if (error) fail(`Failed to resolve ${table}`, error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/** Neutralize characters that would break a PostgREST or()/ilike filter. */
function sanitizeSearch(q: string): string {
  return q.replace(/[,()%*]/g, ' ').trim();
}

export async function listProducts(
  params: ProductListParams,
): Promise<Paginated<ProductSummaryDTO>> {
  let query = db
    .from('products')
    .select(PRODUCT_SELECT, { count: 'exact' })
    .eq('is_published', true);

  if (params.category?.length) {
    const ids = await idsForSlugs('categories', params.category);
    query = query.in('category_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (params.brand?.length) {
    const ids = await idsForSlugs('brands', params.brand);
    query = query.in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (params.minPrice !== undefined) query = query.gte('price', params.minPrice);
  if (params.maxPrice !== undefined) query = query.lte('price', params.maxPrice);
  if (params.inStock) query = query.gt('stock', 0);
  if (params.q) {
    const s = sanitizeSearch(params.q);
    if (s) query = query.or(`name.ilike.%${s}%,short_description.ilike.%${s}%`);
  }

  switch (params.sort) {
    case 'price-asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price-desc':
      query = query.order('price', { ascending: false });
      break;
    case 'name':
      query = query.order('name', { ascending: true });
      break;
    case 'featured':
    default:
      query = query.order('featured', { ascending: false }).order('created_at', { ascending: false });
      break;
  }

  const from = (params.page - 1) * params.pageSize;
  query = query.range(from, from + params.pageSize - 1);

  const { data, error, count } = await query;
  if (error) fail('Failed to list products', error.message);

  const items = (data as unknown as ProductWithRelations[]).map(toProductSummaryDTO);
  return { items, total: count ?? items.length, page: params.page, pageSize: params.pageSize };
}

export async function getFeatured(limit = 8): Promise<ProductSummaryDTO[]> {
  const { data, error } = await db
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_published', true)
    .eq('featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load featured products', error.message);
  return (data as unknown as ProductWithRelations[]).map(toProductSummaryDTO);
}

export async function getProductBySlug(slug: string): Promise<ProductDetailDTO> {
  const { data, error } = await db
    .from('products')
    .select(
      `${PRODUCT_SELECT},
       specs:product_specs ( id, product_id, label, value, sort_order ),
       highlights:product_highlights ( id, product_id, text, sort_order )`,
    )
    .eq('is_published', true)
    .eq('slug', slug)
    .maybeSingle();
  if (error) fail('Failed to load product', error.message);
  if (!data) throw AppError.NotFound('Product not found');

  const product = data as unknown as ProductDetailRelations;

  // Related: same category, published, excluding this product.
  let related: ProductSummaryDTO[] = [];
  if (product.category_id) {
    const { data: rel, error: relErr } = await db
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_published', true)
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .limit(4);
    if (relErr) fail('Failed to load related products', relErr.message);
    related = (rel as unknown as ProductWithRelations[]).map(toProductSummaryDTO);
  }

  return toProductDetailDTO(product, related);
}

export async function listCategories(): Promise<CategoryDTO[]> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to list categories', error.message);

  // Product counts (published only), tallied in one pass.
  const { data: counts, error: countErr } = await db
    .from('products')
    .select('category_id')
    .eq('is_published', true);
  if (countErr) fail('Failed to count products', countErr.message);

  const tally = new Map<string, number>();
  for (const row of counts ?? []) {
    const id = (row as { category_id: string | null }).category_id;
    if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
  }

  return (data as CategoryRow[]).map((c) => toCategoryDTO(c, tally.get(c.id) ?? 0));
}

export async function listBrands(): Promise<BrandDTO[]> {
  const { data, error } = await db
    .from('brands')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) fail('Failed to list brands', error.message);
  return (data as BrandRow[]).map(toBrandDTO);
}
