import type {
  BrandDTO,
  CategoryDTO,
  Paginated,
  ProductDetailDTO,
  ProductSummaryDTO,
} from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
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

/**
 * Expand requested category slugs to include every child (subcategory) slug,
 * so filtering by a parent also matches its subcategories' products. Slugs
 * that are already a child (or don't match anything) pass through unchanged
 * — a child has no children of its own (depth is capped at 2 in the admin
 * service). Deliberately keeps `search_products` (0005_search.sql) untouched:
 * this expansion happens here, before either query path consumes the slugs.
 */
async function expandCategorySlugs(slugs: string[]): Promise<string[]> {
  if (!slugs.length) return slugs;

  const { data, error } = await db.from('categories').select('id, parent_id').in('slug', slugs);
  if (error) fail('Failed to resolve categories', error.message);
  const matched = (data ?? []) as Pick<CategoryRow, 'id' | 'parent_id'>[];

  const parentIds = matched.filter((c) => c.parent_id === null).map((c) => c.id);
  if (!parentIds.length) return slugs;

  const { data: children, error: childErr } = await db
    .from('categories')
    .select('slug')
    .in('parent_id', parentIds);
  if (childErr) fail('Failed to resolve child categories', childErr.message);
  const childSlugs = (children ?? []).map((r) => (r as { slug: string }).slug);

  return Array.from(new Set([...slugs, ...childSlugs]));
}

/** Non-search product listing: filters + a plain PostgREST sort, no ranking. */
async function listProductsPlain(
  params: ProductListParams,
  sort: NonNullable<ProductListParams['sort']>,
): Promise<Paginated<ProductSummaryDTO>> {
  let query = db
    .from('products')
    .select(PRODUCT_SELECT, { count: 'exact' })
    .eq('is_published', true);

  if (params.category?.length) {
    const expanded = await expandCategorySlugs(params.category);
    const ids = await idsForSlugs('categories', expanded);
    query = query.in('category_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (params.brand?.length) {
    const ids = await idsForSlugs('brands', params.brand);
    query = query.in('brand_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (params.minPrice !== undefined) query = query.gte('price', params.minPrice);
  if (params.maxPrice !== undefined) query = query.lte('price', params.maxPrice);
  if (params.inStock) query = query.gt('stock', 0);

  switch (sort) {
    case 'price-asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price-desc':
      query = query.order('price', { ascending: false });
      break;
    case 'name':
      query = query.order('name', { ascending: true });
      break;
    // 'relevance' has no meaning without a search query; fall back to 'featured'.
    case 'featured':
    case 'relevance':
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

interface SearchHit {
  product_id: string;
  score: number;
  total_count: number;
}

/**
 * Search-backed listing: ranks via the `search_products` RPC (0005_search.sql
 * — full-text + trigram, see that file for why), then re-selects the ranked
 * ids through the same PRODUCT_SELECT/mapper path as every other listing so
 * resolvePrice() stays the single pricing authority and the RPC never becomes
 * a second source of truth for product data.
 */
async function searchProducts(
  params: ProductListParams,
  q: string,
  sort: NonNullable<ProductListParams['sort']>,
): Promise<Paginated<ProductSummaryDTO>> {
  const expandedCategories = params.category?.length
    ? await expandCategorySlugs(params.category)
    : undefined;

  const { data, error } = await db.rpc('search_products', {
    p_q: q,
    p_category_slugs: expandedCategories?.length ? expandedCategories : null, // [] means "match nothing" in SQL, not "no filter"
    p_brand_slugs: params.brand?.length ? params.brand : null,
    p_min_price: params.minPrice ?? null,
    p_max_price: params.maxPrice ?? null,
    p_in_stock: params.inStock ?? false,
    p_sort: sort,
    p_limit: params.pageSize,
    p_offset: (params.page - 1) * params.pageSize,
  });
  if (error) fail('Failed to search products', error.message);

  const hits = (data ?? []) as SearchHit[];
  if (hits.length === 0) {
    // Cheapest observability we have: this is the evidence that decides
    // whether semantic search is ever worth building (see ARCHITECTURE §10 seam notes).
    logger.info({ q }, 'catalog search returned no results');
    return { items: [], total: 0, page: params.page, pageSize: params.pageSize };
  }

  const ids = hits.map((h) => h.product_id);
  const { data: rows, error: rowErr } = await db
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_published', true) // re-assert: a row could be unpublished between the two queries
    .in('id', ids);
  if (rowErr) fail('Failed to load search results', rowErr.message);

  // Reorder by RPC position, not by score: score-sorting would silently
  // override an explicit sort=price-asc, and re-sorting the fetched page in
  // JS would only be sorted-within-page (page 2's cheapest could be cheaper
  // than page 1's). Position from the RPC is already correct for every sort.
  const byId = new Map((rows as unknown as ProductWithRelations[]).map((r) => [r.id, r]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((r): r is ProductWithRelations => r !== undefined)
    .map(toProductSummaryDTO);

  return {
    items,
    total: Number(hits[0]!.total_count),
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function listProducts(
  params: ProductListParams,
): Promise<Paginated<ProductSummaryDTO>> {
  const q = params.q?.trim();
  // Explicit user sort always wins. Relevance is only the *default* when the
  // user hasn't chosen a sort and a search query is present (schema.ts drops
  // the old server-side default for exactly this reason).
  const sort = params.sort ?? (q ? 'relevance' : 'featured');
  return q ? searchProducts(params, q, sort) : listProductsPlain(params, sort);
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

  const rows = data as CategoryRow[];

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

  // Roll up: a parent's count is its own products plus every child's, since
  // filtering the storefront by a parent also matches its children's products.
  const rolledUp = new Map<string, number>();
  for (const c of rows) rolledUp.set(c.id, tally.get(c.id) ?? 0);
  for (const c of rows) {
    if (c.parent_id) {
      rolledUp.set(c.parent_id, (rolledUp.get(c.parent_id) ?? 0) + (tally.get(c.id) ?? 0));
    }
  }

  return rows.map((c) => toCategoryDTO(c, rolledUp.get(c.id) ?? 0));
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
