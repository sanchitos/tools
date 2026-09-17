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
import { DEFAULT_LOCALE, type Locale } from '../../lib/locale.js';
import type { ProductListParams } from './schema.js';
import {
  toBrandDTO,
  toCategoryDTO,
  toProductDetailDTO,
  toProductSummaryDTO,
  type ProductDetailRelations,
  type ProductWithRelations,
} from './mappers.js';

/**
 * Columns + embedded relations for a product summary/detail row.
 *
 * `categories!category_id` — the FK hint is REQUIRED. product_subcategories
 * (0012) gives products a second path to categories (a many-to-many through
 * that junction), and an unhinted `categories` embed fails with PGRST201
 * "more than one relationship was found" on every product read. The hint names
 * the column, which pins the direct FK.
 */
const PRODUCT_SELECT = `
  id, slug, name, name_es, brand_id, category_id,
  short_description, short_description_es, description, description_es,
  price, currency, stock, sku, featured, is_published, rating, review_count,
  created_at, updated_at,
  brand:brands ( id, name, slug, logo_url, sort_order, is_featured, created_at, updated_at ),
  category:categories!category_id ( id, slug, label, label_es ),
  images:product_images ( id, product_id, url, is_primary, alt_text, sort_order, created_at )
`;

function fail(message: string, details?: unknown): never {
  throw AppError.Internal(message, details);
}

/** Sentinel for "match nothing": an `in ()` with an empty list is invalid. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Ids of products carrying any of these subcategory tags (0012's junction).
 *
 * Interpolated into `or()` below rather than paginated: the list is bounded by
 * the tag rows for the requested categories — at this catalog's size, tens of
 * ids. The values are DB-sourced uuids (no commas, parens or quotes), so the
 * interpolation has no injection surface. If the catalog ever grows to where
 * this approaches the gateway's ~8KB request-line limit, the fallback is the
 * search RPC, which implements the identical predicate in SQL (0012) and has a
 * query-less browse leg.
 */
async function productIdsForSubcategories(categoryIds: string[]): Promise<string[]> {
  if (!categoryIds.length) return [];
  const { data, error } = await db
    .from('product_subcategories')
    .select('product_id')
    .in('category_id', categoryIds);
  if (error) fail('Failed to resolve tagged products', error.message);
  return Array.from(new Set((data ?? []).map((r) => (r as { product_id: string }).product_id)));
}

/** Resolve category/brand slugs to ids. Unknown slugs yield an empty match set. */
async function idsForSlugs(table: 'categories' | 'brands', slugs: string[]): Promise<string[]> {
  const { data, error } = await db.from(table).select('id').in('slug', slugs);
  if (error) fail(`Failed to resolve ${table}`, error.message);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

interface CategoryFilter {
  /**
   * Slugs to match against a product's MAIN category: the requested ones, plus
   * every child of a requested parent. The child expansion is what still
   * matches a row whose `category_id` points at a subcategory — pre-0012 data,
   * or a row written before that migration ran.
   */
  slugs: string[];
  /**
   * Ids of the requested slugs that are CHILDREN — the only ones that can
   * appear as a tag in `product_subcategories`. Deliberately NOT the expanded
   * children: a product tagged with a child of a requested parent already
   * matches through its main category (the API guarantees a tag's parent IS the
   * product's main category), so including them would only pad the id list that
   * goes into the request URL on every department filter.
   */
  childIds: string[];
}

/**
 * Resolve requested category slugs into the two things both query paths need:
 * which slugs can match a main category, and which requested categories are
 * subcategories whose tags must be looked up.
 */
async function resolveCategoryFilter(slugs: string[]): Promise<CategoryFilter> {
  if (!slugs.length) return { slugs, childIds: [] };

  const { data, error } = await db.from('categories').select('id, parent_id').in('slug', slugs);
  if (error) fail('Failed to resolve categories', error.message);
  const matched = (data ?? []) as Pick<CategoryRow, 'id' | 'parent_id'>[];

  const childIds = matched.filter((c) => c.parent_id !== null).map((c) => c.id);
  const parentIds = matched.filter((c) => c.parent_id === null).map((c) => c.id);
  if (!parentIds.length) return { slugs, childIds };

  const { data: children, error: childErr } = await db
    .from('categories')
    .select('slug')
    .in('parent_id', parentIds);
  if (childErr) fail('Failed to resolve child categories', childErr.message);
  const childSlugs = (children ?? []).map((r) => (r as { slug: string }).slug);

  return { slugs: Array.from(new Set([...slugs, ...childSlugs])), childIds };
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
    const filter = await resolveCategoryFilter(params.category);
    const ids = await idsForSlugs('categories', filter.slugs);
    const catIds = ids.length ? ids : [NIL_UUID];
    // A product matches on its main category OR on a subcategory TAG (0012).
    // PostgREST can't OR a top-level column against an embedded to-many table
    // (`!inner` is an AND and would drop every untagged product), so resolve the
    // tagged product ids first and OR the two id lists. `or()` composes with the
    // other filters, which PostgREST ANDs together. A department-only filter
    // takes the plain `in` branch — no tags to look up, no id list in the URL.
    const taggedIds = await productIdsForSubcategories(filter.childIds);
    query = taggedIds.length
      ? query.or(`category_id.in.(${catIds.join(',')}),id.in.(${taggedIds.join(',')})`)
      : query.in('category_id', catIds);
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

  const items = (data as unknown as ProductWithRelations[]).map((r) =>
    toProductSummaryDTO(r, params.lang),
  );
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
  // Expanded slugs, raw: search_products (0012) matches them against the main
  // category AND against the junction's subcategory slugs, in SQL.
  const expandedCategories = params.category?.length
    ? (await resolveCategoryFilter(params.category)).slugs
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
    // Named args: a new defaulted parameter is backward-compatible — but only
    // because 0009 DROPped the old 9-arg overload rather than replacing it.
    p_lang: params.lang,
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
    .map((r) => toProductSummaryDTO(r, params.lang));

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

export async function getFeatured(
  locale: Locale = DEFAULT_LOCALE,
  limit = 8,
): Promise<ProductSummaryDTO[]> {
  const { data, error } = await db
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('is_published', true)
    .eq('featured', true)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) fail('Failed to load featured products', error.message);
  return (data as unknown as ProductWithRelations[]).map((r) => toProductSummaryDTO(r, locale));
}

export async function getProductBySlug(
  slug: string,
  locale: Locale = DEFAULT_LOCALE,
): Promise<ProductDetailDTO> {
  const { data, error } = await db
    .from('products')
    .select(
      `${PRODUCT_SELECT},
       subcategories:product_subcategories ( category_id ),
       specs:product_specs ( id, product_id, label, label_es, value, value_es, sort_order ),
       highlights:product_highlights ( id, product_id, text, text_es, sort_order )`,
    )
    .eq('is_published', true)
    .eq('slug', slug)
    .maybeSingle();
  if (error) fail('Failed to load product', error.message);
  if (!data) throw AppError.NotFound('Product not found');

  const product = data as unknown as ProductDetailRelations;

  // Related: products sharing a subcategory first, then topped up from the same
  // department. Before 0012 `category_id` usually held the SUBCATEGORY, so
  // "same category" WAS the tight match; asking the junction first is what keeps
  // that tightness now that category_id only ever holds the department.
  const RELATED_LIMIT = 4;
  let related: ProductSummaryDTO[] = [];

  const tagIds = (product.subcategories ?? []).map((s) => s.category_id);
  if (tagIds.length) {
    const siblingIds = (await productIdsForSubcategories(tagIds)).filter((id) => id !== product.id);
    if (siblingIds.length) {
      const { data: rel, error: relErr } = await db
        .from('products')
        .select(PRODUCT_SELECT)
        .eq('is_published', true)
        .in('id', siblingIds)
        .limit(RELATED_LIMIT);
      if (relErr) fail('Failed to load related products', relErr.message);
      related = (rel as unknown as ProductWithRelations[]).map((r) =>
        toProductSummaryDTO(r, locale),
      );
    }
  }

  if (related.length < RELATED_LIMIT && product.category_id) {
    // Overfetch and dedupe in JS rather than building a `not.in.(...)` list:
    // at most a handful of extra rows, and no interpolated id list in the URL.
    const { data: rel, error: relErr } = await db
      .from('products')
      .select(PRODUCT_SELECT)
      .eq('is_published', true)
      .eq('category_id', product.category_id)
      .neq('id', product.id)
      .limit(RELATED_LIMIT * 2);
    if (relErr) fail('Failed to load related products', relErr.message);
    const seen = new Set(related.map((r) => r.id));
    for (const row of (rel ?? []) as unknown as ProductWithRelations[]) {
      if (related.length >= RELATED_LIMIT) break;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      related.push(toProductSummaryDTO(row, locale));
    }
  }

  return toProductDetailDTO(product, related, locale);
}

export async function listCategories(locale: Locale = DEFAULT_LOCALE): Promise<CategoryDTO[]> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .eq('is_published', true)
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to list categories', error.message);

  const rows = data as CategoryRow[];

  // Product counts (published only). Sets of product ids, not counters: since
  // 0012 a product reaches a category two ways — as its main category, or as a
  // subcategory tag — and a product tagged with two subcategories of the same
  // department must still count ONCE toward that department. De-duplicating on
  // the product id is the only thing that guarantees that, and it also makes the
  // parent roll-up idempotent.
  const { data: counts, error: countErr } = await db
    .from('products')
    .select('id, category_id')
    .eq('is_published', true);
  if (countErr) fail('Failed to count products', countErr.message);

  const { data: tagRows, error: tagErr } = await db
    .from('product_subcategories')
    .select('product_id, category_id');
  if (tagErr) fail('Failed to count subcategory products', tagErr.message);

  const publishedProducts = (counts ?? []) as { id: string; category_id: string | null }[];
  const publishedIds = new Set(publishedProducts.map((p) => p.id));
  const parentOf = new Map(rows.map((c) => [c.id, c.parent_id]));

  const members = new Map<string, Set<string>>();
  const add = (categoryId: string, productId: string) => {
    let set = members.get(categoryId);
    if (!set) members.set(categoryId, (set = new Set()));
    set.add(productId);
  };

  for (const p of publishedProducts) {
    if (!p.category_id) continue;
    add(p.category_id, p.id);
    // Legacy rows whose main category is still a child roll up to its parent,
    // because filtering by the parent matches them (resolveCategoryFilter).
    const parent = parentOf.get(p.category_id);
    if (parent) add(parent, p.id);
  }
  for (const row of tagRows ?? []) {
    const t = row as { product_id: string; category_id: string };
    if (!publishedIds.has(t.product_id)) continue;
    add(t.category_id, t.product_id);
    // A tag on an UNPUBLISHED category isn't in parentOf, so it contributes
    // nothing — the product still counts toward its department via category_id.
    const parent = parentOf.get(t.category_id);
    if (parent) add(parent, t.product_id);
  }

  return rows.map((c) => toCategoryDTO(c, members.get(c.id)?.size ?? 0, locale));
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
