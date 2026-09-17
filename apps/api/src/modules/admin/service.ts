import type {
  AdminBrandDTO,
  AdminCategoryDTO,
  AdminHomeContentDTO,
  AdminHomeTileDTO,
  AdminStoreLocationDTO,
  AdminProductDTO,
  AdminProductListItem,
  AdminUserListItem,
  OrphanCleanupResult,
  Paginated,
  ProductImageDTO,
} from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import type {
  CategoryRow,
  HomeHeroRow,
  HomeTileRow,
  ProfileRow,
  StoreLocationRow,
} from '../../types/db.js';
import { isEmailTaken } from '../auth/service.js';
import {
  listAllObjectPaths,
  pathFromPublicUrl,
  removeObjectByUrl,
  removeObjects,
  uploadObject,
  uploadProductImage,
  BRAND_LOGOS_BUCKET,
  CATEGORY_IMAGES_BUCKET,
  PRODUCT_IMAGES_BUCKET,
  SITE_IMAGES_BUCKET,
  type Bucket,
  type UploadedFile,
} from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';
import { toImageDTO } from '../catalog/mappers.js';
import type {
  ProductDetailRelations,
  ProductWithRelations,
} from '../catalog/mappers.js';
import {
  toAdminBrandDTO,
  toAdminCategoryDTO,
  toAdminHomeHeroDTO,
  toAdminHomeTileDTO,
  toAdminProductDTO,
  toAdminProductListItem,
  toAdminStoreLocationDTO,
  toAdminUserListItem,
} from './mappers.js';
import type {
  AdminProductListQuery,
  AdminUserListQuery,
  BrandCreate,
  BrandUpdate,
  CategoryCreate,
  CategoryUpdate,
  HeroUpdate,
  ImageUploadMeta,
  LocationCreate,
  LocationUpdate,
  ProductCreate,
  ProductUpdate,
  ReorderInput,
  TileCreate,
  TileUpdate,
  UserCreate,
} from './schema.js';

/**
 * Columns + embedded relations for an admin product row.
 *
 * `categories!category_id` — the FK hint is REQUIRED, not decorative.
 * product_subcategories (0012) gives products a SECOND path to categories (a
 * many-to-many through that junction), so an unhinted `categories` embed fails
 * with PGRST201 "more than one relationship was found" on EVERY product read.
 * The hint names the column, which pins the direct FK. Embedding the junction
 * itself (`product_subcategories`) needs no hint: there is only one FK to it.
 *
 * NB: this string is sent verbatim as PostgREST's `select` param — it must stay
 * a plain field list, so keep commentary out here and in it.
 */
const LIST_SELECT = `
  id, slug, name, name_es, brand_id, category_id,
  short_description, short_description_es, description, description_es,
  price, currency, stock, sku, featured, is_published, rating, review_count,
  created_at, updated_at,
  brand:brands ( id, name, slug, logo_url, sort_order, is_featured, created_at, updated_at ),
  category:categories!category_id ( id, slug, label, label_es ),
  subcategories:product_subcategories ( category_id ),
  images:product_images ( id, product_id, url, is_primary, alt_text, sort_order, created_at )
`;

const DETAIL_SELECT = `${LIST_SELECT},
  specs:product_specs ( id, product_id, label, label_es, value, value_es, sort_order ),
  highlights:product_highlights ( id, product_id, text, text_es, sort_order )`;

function fail(message: string, error: { message: string; code?: string }): never {
  throw AppError.Internal(message, error.message);
}

function isFkViolation(error: { code?: string } | null): boolean {
  return error?.code === '23503';
}

/** Sentinel for "match nothing" — an `in`/`eq` with an empty list is invalid. */
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/** Ids of products tagged with any of `categoryIds` (0012's junction table). */
async function productIdsForSubcategories(categoryIds: string[]): Promise<string[]> {
  if (!categoryIds.length) return [];
  const { data, error } = await db
    .from('product_subcategories')
    .select('product_id')
    .in('category_id', categoryIds);
  if (error) fail('Failed to resolve tagged products', error);
  return Array.from(new Set((data ?? []).map((r) => (r as { product_id: string }).product_id)));
}

/** Return a slug unique within `table`, suffixing -2, -3… on collision. */
async function ensureUniqueSlug(
  table: 'products' | 'categories' | 'brands',
  base: string,
  excludeId?: string,
): Promise<string> {
  let candidate = base;
  for (let n = 2; ; n++) {
    const { data, error } = await db.from(table).select('id').eq('slug', candidate).limit(1);
    if (error) fail(`Failed to check ${table} slug`, error);
    const row = data?.[0] as { id: string } | undefined;
    if (!row || row.id === excludeId) return candidate;
    candidate = `${base}-${n}`;
  }
}

// ===========================================================================
// Products
// ===========================================================================

export async function getAdminProduct(id: string): Promise<AdminProductDTO> {
  const { data, error } = await db.from('products').select(DETAIL_SELECT).eq('id', id).maybeSingle();
  if (error) fail('Failed to load product', error);
  if (!data) throw AppError.NotFound('Product not found');
  return toAdminProductDTO(data as unknown as ProductDetailRelations);
}

export async function listAdminProducts(
  params: AdminProductListQuery,
): Promise<Paginated<AdminProductListItem>> {
  let query = db.from('products').select(LIST_SELECT, { count: 'exact' });

  if (params.published !== undefined) query = query.eq('is_published', params.published);
  if (params.q) query = query.ilike('name', `%${params.q.replace(/[,()%*]/g, ' ')}%`);
  if (params.category) {
    const { data: cat } = await db
      .from('categories')
      .select('id, parent_id')
      .eq('slug', params.category)
      .maybeSingle();
    const row = cat as Pick<CategoryRow, 'id' | 'parent_id'> | null;
    if (!row) {
      query = query.eq('category_id', NIL_UUID);
    } else if (row.parent_id === null) {
      query = query.eq('category_id', row.id);
    } else {
      // A subcategory slug: since 0012 no product's category_id points at a
      // child, so match through the junction instead of returning nothing.
      const productIds = await productIdsForSubcategories([row.id]);
      query = query.in('id', productIds.length ? productIds : [NIL_UUID]);
    }
  }

  query = query.order('updated_at', { ascending: false });
  const from = (params.page - 1) * params.pageSize;
  query = query.range(from, from + params.pageSize - 1);

  const { data, error, count } = await query;
  if (error) fail('Failed to list products', error);

  const items = (data as unknown as ProductWithRelations[]).map(toAdminProductListItem);
  return { items, total: count ?? items.length, page: params.page, pageSize: params.pageSize };
}

async function replaceSpecs(productId: string, specs: ProductCreate['specs']): Promise<void> {
  const del = await db.from('product_specs').delete().eq('product_id', productId);
  if (del.error) fail('Failed to update specs', del.error);
  if (specs && specs.length) {
    const rows = specs.map((s, i) => ({
      product_id: productId,
      label: s.label,
      label_es: s.labelEs,
      value: s.value,
      value_es: s.valueEs,
      sort_order: s.sortOrder ?? i,
    }));
    const ins = await db.from('product_specs').insert(rows);
    if (ins.error) fail('Failed to insert specs', ins.error);
  }
}

async function replaceHighlights(
  productId: string,
  highlights: ProductCreate['highlights'],
): Promise<void> {
  const del = await db.from('product_highlights').delete().eq('product_id', productId);
  if (del.error) fail('Failed to update highlights', del.error);
  if (highlights && highlights.length) {
    const rows = highlights.map((h, i) => ({
      product_id: productId,
      text: h.text,
      text_es: h.textEs,
      sort_order: h.sortOrder ?? i,
    }));
    const ins = await db.from('product_highlights').insert(rows);
    if (ins.error) fail('Failed to insert highlights', ins.error);
  }
}

/**
 * Enforce the taxonomy split that 0012 introduced and the DB cannot express:
 * `products.category_id` is the MAIN category and is always top-level, and
 * every subcategory tag is a CHILD OF THAT category. Neither rule fits in a
 * CHECK constraint (no subqueries, no cross-table references), so this is the
 * only guard — exactly as `validateParentId` is the only guard for hierarchy
 * depth (0007).
 */
async function validateTaxonomy(categoryId: string, subcategoryIds: string[]): Promise<void> {
  const ids = Array.from(new Set([categoryId, ...subcategoryIds]));
  const { data, error } = await db.from('categories').select('id, label, parent_id').in('id', ids);
  if (error) fail('Failed to resolve categories', error);

  const rows = (data ?? []) as Pick<CategoryRow, 'id' | 'label' | 'parent_id'>[];
  const byId = new Map(rows.map((c) => [c.id, c]));

  const main = byId.get(categoryId);
  if (!main) throw AppError.BadRequest('Category does not exist');
  if (main.parent_id !== null) {
    throw AppError.BadRequest(
      `"${main.label}" is a subcategory — choose a top-level category as the main one`,
    );
  }

  for (const subId of subcategoryIds) {
    const sub = byId.get(subId);
    if (!sub) throw AppError.BadRequest('Subcategory does not exist');
    if (sub.parent_id !== categoryId) {
      throw AppError.BadRequest(`"${sub.label}" is not a subcategory of "${main.label}"`);
    }
  }
}

/** Ids of every direct child of `parentId`. */
async function childCategoryIds(parentId: string): Promise<string[]> {
  const { data, error } = await db.from('categories').select('id').eq('parent_id', parentId);
  if (error) fail('Failed to resolve subcategories', error);
  return (data ?? []).map((r) => (r as { id: string }).id);
}

/**
 * Rewrite a product's subcategory tags. Same delete-then-insert contract as
 * replaceSpecs: an omitted key leaves the rows alone, `[]` clears them.
 */
async function replaceProductSubcategories(productId: string, ids: string[]): Promise<void> {
  const del = await db.from('product_subcategories').delete().eq('product_id', productId);
  if (del.error) fail('Failed to update subcategories', del.error);

  const unique = Array.from(new Set(ids));
  if (unique.length) {
    const rows = unique.map((category_id) => ({ product_id: productId, category_id }));
    const ins = await db.from('product_subcategories').insert(rows);
    if (ins.error) {
      if (isFkViolation(ins.error)) throw AppError.BadRequest('Invalid subcategory');
      fail('Failed to insert subcategories', ins.error);
    }
  }
}

export async function createProduct(input: ProductCreate): Promise<AdminProductDTO> {
  await validateTaxonomy(input.categoryId, input.subcategoryIds ?? []);
  const slug = await ensureUniqueSlug('products', slugify(input.slug ?? input.name));

  const { data, error } = await db
    .from('products')
    .insert({
      slug,
      name: input.name,
      name_es: input.nameEs,
      brand_id: input.brandId ?? null,
      category_id: input.categoryId,
      short_description: input.shortDescription ?? null,
      short_description_es: input.shortDescriptionEs,
      description: input.description ?? null,
      description_es: input.descriptionEs,
      price: input.price,
      currency: 'JMD',
      stock: input.stock,
      sku: input.sku ?? null,
      featured: input.featured,
      is_published: input.isPublished,
    })
    .select('id')
    .single();

  if (error) {
    if (isFkViolation(error)) throw AppError.BadRequest('Invalid category or brand');
    if (error.code === '23505') throw AppError.Conflict('SKU or slug already exists');
    fail('Failed to create product', error);
  }

  const id = (data as { id: string }).id;
  if (input.specs) await replaceSpecs(id, input.specs);
  if (input.highlights) await replaceHighlights(id, input.highlights);
  if (input.subcategoryIds?.length) await replaceProductSubcategories(id, input.subcategoryIds);
  return getAdminProduct(id);
}

export async function updateProduct(id: string, input: ProductUpdate): Promise<AdminProductDTO> {
  const current = await getAdminProduct(id); // 404 if missing

  // Taxonomy is validated against the EFFECTIVE pair, not just what was sent.
  // Two distinct cases, and the difference is deliberate:
  //   - tags supplied explicitly that don't fit the category -> 400, so a bad
  //     client can't write rows the filters and counts would then misreport;
  //   - a category MOVE with no new tag list -> silently prune the tags that no
  //     longer belong, because 400-ing a PATCH of {categoryId} alone would be
  //     obstructive, and the editor clears the selection on change anyway.
  // A PATCH touching neither key validates nothing, so {isPublished:true} can
  // never 400 on taxonomy.
  const nextCategoryId = input.categoryId ?? current.categoryId;
  let nextSubcategoryIds: string[] | undefined;
  if (nextCategoryId && input.subcategoryIds !== undefined) {
    await validateTaxonomy(nextCategoryId, input.subcategoryIds);
    nextSubcategoryIds = input.subcategoryIds;
  } else if (nextCategoryId && input.categoryId !== undefined) {
    await validateTaxonomy(nextCategoryId, []);
    if (input.categoryId !== current.categoryId && current.subcategoryIds.length) {
      const children = new Set(await childCategoryIds(nextCategoryId));
      nextSubcategoryIds = current.subcategoryIds.filter((sid) => children.has(sid));
    }
  }

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.nameEs !== undefined) patch.name_es = input.nameEs;
  if (input.slug !== undefined) {
    patch.slug = await ensureUniqueSlug('products', slugify(input.slug), id);
  }
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.brandId !== undefined) patch.brand_id = input.brandId;
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription;
  if (input.shortDescriptionEs !== undefined) patch.short_description_es = input.shortDescriptionEs;
  if (input.description !== undefined) patch.description = input.description;
  if (input.descriptionEs !== undefined) patch.description_es = input.descriptionEs;
  if (input.price !== undefined) patch.price = input.price;
  if (input.stock !== undefined) patch.stock = input.stock;
  if (input.sku !== undefined) patch.sku = input.sku;
  if (input.featured !== undefined) patch.featured = input.featured;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('products').update(patch).eq('id', id);
    if (error) {
      if (isFkViolation(error)) throw AppError.BadRequest('Invalid category or brand');
      if (error.code === '23505') throw AppError.Conflict('SKU or slug already exists');
      fail('Failed to update product', error);
    }
  }

  if (input.specs !== undefined) await replaceSpecs(id, input.specs);
  if (input.highlights !== undefined) await replaceHighlights(id, input.highlights);
  if (nextSubcategoryIds !== undefined) {
    await replaceProductSubcategories(id, nextSubcategoryIds);
  }
  return getAdminProduct(id);
}

export async function deleteProduct(id: string): Promise<void> {
  const { data: imgs, error: imgErr } = await db
    .from('product_images')
    .select('url')
    .eq('product_id', id);
  if (imgErr) fail('Failed to load product images', imgErr);

  const { data: existing, error: exErr } = await db
    .from('products')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load product', exErr);
  if (!existing) throw AppError.NotFound('Product not found');

  const { error } = await db.from('products').delete().eq('id', id); // cascades child rows
  if (error) fail('Failed to delete product', error);

  const paths = (imgs ?? [])
    .map((r) => pathFromPublicUrl(PRODUCT_IMAGES_BUCKET, (r as { url: string }).url))
    .filter((p): p is string => p !== null);
  await removeObjects(PRODUCT_IMAGES_BUCKET, paths);
}

// ===========================================================================
// Product images
// ===========================================================================

async function listProductImages(productId: string): Promise<ProductImageDTO[]> {
  const { data, error } = await db
    .from('product_images')
    .select('*')
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to load images', error);
  return (data ?? []).map((r) => toImageDTO(r as never));
}

async function assertProductExists(productId: string): Promise<void> {
  const { data, error } = await db.from('products').select('id').eq('id', productId).maybeSingle();
  if (error) fail('Failed to load product', error);
  if (!data) throw AppError.NotFound('Product not found');
}

export async function addProductImage(
  productId: string,
  file: UploadedFile,
  meta: ImageUploadMeta,
): Promise<ProductImageDTO> {
  await assertProductExists(productId);

  const { data: existing, error: exErr } = await db
    .from('product_images')
    .select('id, sort_order')
    .eq('product_id', productId);
  if (exErr) fail('Failed to load images', exErr);

  const makePrimary = meta.isPrimary === true || (existing?.length ?? 0) === 0;
  const nextSort =
    meta.sortOrder ??
    Math.max(-1, ...(existing ?? []).map((r) => (r as { sort_order: number }).sort_order)) + 1;

  const uploaded = await uploadProductImage(productId, file);

  if (makePrimary) {
    const { error } = await db
      .from('product_images')
      .update({ is_primary: false })
      .eq('product_id', productId);
    if (error) {
      await removeObjects(PRODUCT_IMAGES_BUCKET, [uploaded.path]);
      fail('Failed to reset primary image', error);
    }
  }

  const { data, error } = await db
    .from('product_images')
    .insert({
      product_id: productId,
      url: uploaded.url,
      is_primary: makePrimary,
      alt_text: meta.altText ?? null,
      sort_order: nextSort,
    })
    .select('*')
    .single();
  if (error) {
    await removeObjects(PRODUCT_IMAGES_BUCKET, [uploaded.path]); // roll back the orphaned upload
    fail('Failed to save image', error);
  }
  return toImageDTO(data as never);
}

export async function reorderImages(
  productId: string,
  input: ReorderInput,
): Promise<ProductImageDTO[]> {
  const { data: owned, error } = await db
    .from('product_images')
    .select('id')
    .eq('product_id', productId);
  if (error) fail('Failed to load images', error);
  const ownedIds = new Set((owned ?? []).map((r) => (r as { id: string }).id));

  for (const item of input.items) {
    if (!ownedIds.has(item.id)) throw AppError.BadRequest('Image does not belong to product');
    const upd = await db
      .from('product_images')
      .update({ sort_order: item.sortOrder })
      .eq('id', item.id);
    if (upd.error) fail('Failed to reorder images', upd.error);
  }
  return listProductImages(productId);
}

export async function setPrimaryImage(
  productId: string,
  imageId: string,
): Promise<ProductImageDTO[]> {
  const { data: img, error } = await db
    .from('product_images')
    .select('id')
    .eq('id', imageId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) fail('Failed to load image', error);
  if (!img) throw AppError.NotFound('Image not found');

  const reset = await db
    .from('product_images')
    .update({ is_primary: false })
    .eq('product_id', productId);
  if (reset.error) fail('Failed to update images', reset.error);

  const set = await db.from('product_images').update({ is_primary: true }).eq('id', imageId);
  if (set.error) fail('Failed to set primary image', set.error);

  return listProductImages(productId);
}

export async function deleteProductImage(productId: string, imageId: string): Promise<void> {
  const { data: img, error } = await db
    .from('product_images')
    .select('url, is_primary')
    .eq('id', imageId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) fail('Failed to load image', error);
  if (!img) throw AppError.NotFound('Image not found');

  const { url, is_primary } = img as { url: string; is_primary: boolean };
  const del = await db.from('product_images').delete().eq('id', imageId);
  if (del.error) fail('Failed to delete image', del.error);

  await removeObjectByUrl(PRODUCT_IMAGES_BUCKET, url);

  // If we removed the primary, promote the next image (lowest sort_order).
  if (is_primary) {
    const { data: next } = await db
      .from('product_images')
      .select('id')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true })
      .limit(1);
    const nextId = (next?.[0] as { id: string } | undefined)?.id;
    if (nextId) await db.from('product_images').update({ is_primary: true }).eq('id', nextId);
  }
}

// ===========================================================================
// Categories
// ===========================================================================

export async function listAdminCategories(): Promise<AdminCategoryDTO[]> {
  const { data, error } = await db
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to list categories', error);

  const rows = (data ?? []) as CategoryRow[];

  // Group for display: each top-level category immediately followed by its
  // subcategories (both already in sort_order sequence from the query above).
  const byParent = new Map<string, CategoryRow[]>();
  for (const r of rows) {
    if (r.parent_id) {
      const siblings = byParent.get(r.parent_id) ?? [];
      siblings.push(r);
      byParent.set(r.parent_id, siblings);
    }
  }
  const grouped: CategoryRow[] = [];
  for (const r of rows) {
    if (!r.parent_id) {
      grouped.push(r, ...(byParent.get(r.id) ?? []));
    }
  }
  // Defensive: include any child whose parent wasn't returned above (should
  // not happen since we don't filter by is_published here).
  const seen = new Set(grouped.map((r) => r.id));
  for (const r of rows) if (!seen.has(r.id)) grouped.push(r);

  return grouped.map((r) => toAdminCategoryDTO(r));
}

/**
 * Enforce exactly two levels of category depth. `selfId` is omitted on
 * create (a brand-new category can never already have children).
 */
async function validateParentId(parentId: string | null | undefined, selfId?: string): Promise<void> {
  if (parentId === null || parentId === undefined) return; // top-level: always OK

  if (selfId && parentId === selfId) {
    throw AppError.BadRequest('A category cannot be its own parent');
  }

  const { data: parent, error } = await db
    .from('categories')
    .select('id, parent_id')
    .eq('id', parentId)
    .maybeSingle();
  if (error) fail('Failed to load parent category', error);
  if (!parent) throw AppError.BadRequest('Parent category does not exist');
  if ((parent as { parent_id: string | null }).parent_id !== null) {
    throw AppError.BadRequest('Parent category cannot itself have a parent (max 2 levels deep)');
  }

  if (selfId) {
    const { data: children, error: childErr } = await db
      .from('categories')
      .select('id')
      .eq('parent_id', selfId)
      .limit(1);
    if (childErr) fail('Failed to check category children', childErr);
    if (children && children.length > 0) {
      throw AppError.BadRequest('Category already has subcategories; it cannot become a child itself');
    }
  }
}

export async function createCategory(input: CategoryCreate): Promise<AdminCategoryDTO> {
  await validateParentId(input.parentId ?? null);
  const slug = await ensureUniqueSlug('categories', slugify(input.slug ?? input.label));
  const { data, error } = await db
    .from('categories')
    .insert({
      slug,
      label: input.label,
      label_es: input.labelEs,
      image_url: input.imageUrl ?? null,
      sort_order: input.sortOrder ?? 0,
      is_published: input.isPublished,
      parent_id: input.parentId ?? null,
    })
    .select('*')
    .single();
  if (error) fail('Failed to create category', error);
  return toAdminCategoryDTO(data as never);
}

export async function updateCategory(
  id: string,
  input: CategoryUpdate,
): Promise<AdminCategoryDTO> {
  if (input.parentId !== undefined) await validateParentId(input.parentId, id);

  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.labelEs !== undefined) patch.label_es = input.labelEs;
  if (input.slug !== undefined) patch.slug = await ensureUniqueSlug('categories', slugify(input.slug), id);
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;
  if (input.parentId !== undefined) patch.parent_id = input.parentId;

  const { data, error } = await db
    .from('categories')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) fail('Failed to update category', error);
  if (!data) throw AppError.NotFound('Category not found');
  return toAdminCategoryDTO(data as never);
}

export async function deleteCategory(id: string): Promise<void> {
  const { data: existing } = await db
    .from('categories')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw AppError.NotFound('Category not found');

  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) {
    // `on delete restrict` from products.category_id AND from categories.parent_id
    // AND (since 0012) from product_subcategories.category_id all land here, which
    // is why that FK is restrict: cascade would silently untag every product.
    if (isFkViolation(error)) {
      throw AppError.Conflict(
        'Category still has products or subcategories; reassign or delete them first',
      );
    }
    fail('Failed to delete category', error);
  }

  const url = (existing as { image_url: string | null }).image_url;
  if (url) await removeObjectByUrl(CATEGORY_IMAGES_BUCKET, url);
}

/**
 * Replace a category's (or subcategory's) image. Same compensating-delete shape
 * as setBrandLogo: a failed DB write removes the just-uploaded object, and a
 * successful one removes the OLD object so replacements don't accumulate.
 * Subcategories need nothing extra — they are rows in this same table.
 */
export async function setCategoryImage(id: string, file: UploadedFile): Promise<AdminCategoryDTO> {
  const { data: existing, error: exErr } = await db
    .from('categories')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load category', exErr);
  if (!existing) throw AppError.NotFound('Category not found');
  const previousUrl = (existing as { image_url: string | null }).image_url;

  const uploaded = await uploadObject(CATEGORY_IMAGES_BUCKET, id, file);

  const { data, error } = await db
    .from('categories')
    .update({ image_url: uploaded.url })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    await removeObjects(CATEGORY_IMAGES_BUCKET, [uploaded.path]); // roll back the orphan
    if (error) fail('Failed to save category image', error);
    throw AppError.NotFound('Category not found');
  }

  if (previousUrl) await removeObjectByUrl(CATEGORY_IMAGES_BUCKET, previousUrl);
  return toAdminCategoryDTO(data as never);
}

// ===========================================================================
// Brands
// ===========================================================================

export async function listAdminBrands(): Promise<AdminBrandDTO[]> {
  const { data, error } = await db
    .from('brands')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) fail('Failed to list brands', error);
  return (data ?? []).map((r) => toAdminBrandDTO(r as never));
}

export async function createBrand(input: BrandCreate): Promise<AdminBrandDTO> {
  const slug = await ensureUniqueSlug('brands', slugify(input.slug ?? input.name));
  const { data, error } = await db
    .from('brands')
    .insert({
      name: input.name,
      slug,
      logo_url: input.logoUrl ?? null,
      sort_order: input.sortOrder ?? 0,
      is_featured: input.isFeatured,
    })
    .select('*')
    .single();
  if (error) fail('Failed to create brand', error);
  return toAdminBrandDTO(data as never);
}

export async function updateBrand(id: string, input: BrandUpdate): Promise<AdminBrandDTO> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) patch.slug = await ensureUniqueSlug('brands', slugify(input.slug), id);
  if (input.logoUrl !== undefined) patch.logo_url = input.logoUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isFeatured !== undefined) patch.is_featured = input.isFeatured;

  const { data, error } = await db
    .from('brands')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) fail('Failed to update brand', error);
  if (!data) throw AppError.NotFound('Brand not found');
  return toAdminBrandDTO(data as never);
}

export async function deleteBrand(id: string): Promise<void> {
  const { data: existing } = await db
    .from('brands')
    .select('id, logo_url')
    .eq('id', id)
    .maybeSingle();
  if (!existing) throw AppError.NotFound('Brand not found');

  const { error } = await db.from('brands').delete().eq('id', id); // products.brand_id -> null
  if (error) fail('Failed to delete brand', error);

  // Seeded brands with an external or NULL logo_url are untouched for free:
  // pathFromPublicUrl returns null for anything outside our bucket.
  const logoUrl = (existing as { logo_url: string | null }).logo_url;
  if (logoUrl) await removeObjectByUrl(BRAND_LOGOS_BUCKET, logoUrl);
}

/**
 * Replace a brand's logo. Mirrors addProductImage's compensating-delete
 * pattern: on a DB failure the just-uploaded object is removed rather than
 * left orphaned, and on success the OLD object is removed so repeated
 * replacements don't accumulate.
 */
export async function setBrandLogo(id: string, file: UploadedFile): Promise<AdminBrandDTO> {
  const { data: existing, error: exErr } = await db
    .from('brands')
    .select('id, logo_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load brand', exErr);
  if (!existing) throw AppError.NotFound('Brand not found');
  const previousUrl = (existing as { logo_url: string | null }).logo_url;

  const uploaded = await uploadObject(BRAND_LOGOS_BUCKET, id, file);

  const { data, error } = await db
    .from('brands')
    .update({ logo_url: uploaded.url })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    await removeObjects(BRAND_LOGOS_BUCKET, [uploaded.path]); // roll back the orphaned upload
    if (error) fail('Failed to save brand logo', error);
    throw AppError.NotFound('Brand not found');
  }

  if (previousUrl) await removeObjectByUrl(BRAND_LOGOS_BUCKET, previousUrl);
  return toAdminBrandDTO(data as never);
}

// ===========================================================================
// Homepage content
// ===========================================================================

export async function getAdminHomeContent(): Promise<AdminHomeContentDTO> {
  const [heroRes, tilesRes] = await Promise.all([
    db.from('home_hero').select('*').maybeSingle(),
    // Unpublished included, unlike the public read: the admin edits them.
    db.from('home_tiles').select('*').order('slot').order('sort_order', { ascending: true }),
  ]);
  if (heroRes.error) fail('Failed to load hero', heroRes.error);
  if (tilesRes.error) fail('Failed to load home tiles', tilesRes.error);

  return {
    hero: heroRes.data ? toAdminHomeHeroDTO(heroRes.data as HomeHeroRow) : null,
    tiles: (tilesRes.data as HomeTileRow[]).map(toAdminHomeTileDTO),
  };
}

/**
 * Write the singleton hero.
 *
 * Deliberately NOT an upsert, even though `id boolean primary key check (id)`
 * makes one look natural. PostgREST turns `.upsert()` into
 * `insert ... on conflict (id) do update`, and Postgres evaluates NOT NULL
 * constraints on the PROPOSED tuple BEFORE it resolves the conflict — so any
 * partial write that omits `headline` (NOT NULL, no default) fails with 23502
 * even when the row already exists. That is not a hypothetical: it is what made
 * hero image replacement 500 with "Failed to save hero image". Branching on
 * existence, the way setTileImage/setLocationImage already do, removes the whole
 * class of bug rather than patching the one symptom.
 */
export async function updateHero(input: HeroUpdate) {
  const patch: Record<string, unknown> = { id: true };
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.eyebrow !== undefined) patch.eyebrow = input.eyebrow;
  if (input.eyebrowEs !== undefined) patch.eyebrow_es = input.eyebrowEs;
  if (input.headline !== undefined) patch.headline = input.headline;
  if (input.headlineEs !== undefined) patch.headline_es = input.headlineEs;
  if (input.subcopy !== undefined) patch.subcopy = input.subcopy;
  if (input.subcopyEs !== undefined) patch.subcopy_es = input.subcopyEs;
  if (input.ctaLabel !== undefined) patch.cta_label = input.ctaLabel;
  if (input.ctaLabelEs !== undefined) patch.cta_label_es = input.ctaLabelEs;
  if (input.ctaHref !== undefined) patch.cta_href = input.ctaHref;

  const { data: existing } = await db.from('home_hero').select('id').maybeSingle();
  if (!existing && patch.headline === undefined) {
    throw AppError.BadRequest('A headline is required to create the hero');
  }

  const { data, error } = existing
    ? await db.from('home_hero').update(patch).eq('id', true).select('*').maybeSingle()
    : await db.from('home_hero').insert(patch).select('*').maybeSingle();
  if (error) fail('Failed to save hero', error);
  if (!data) throw AppError.NotFound('Hero not found');
  return toAdminHomeHeroDTO(data as never);
}

/**
 * Replace the hero image, rolling back the upload if the DB write fails.
 *
 * An UPDATE, never an upsert — see updateHero's comment: an upsert that carries
 * only `image_url` trips `headline`'s NOT NULL on the proposed insert tuple and
 * 23502s even against an existing row. There is no insert branch here either,
 * because creating the hero needs a headline this endpoint doesn't have; the
 * admin saves the text first (which the UI enforces by hiding the picker).
 */
export async function setHeroImage(file: UploadedFile) {
  const { data: existing, error: exErr } = await db
    .from('home_hero')
    .select('id, image_url')
    .maybeSingle();
  if (exErr) fail('Failed to load hero', exErr);
  if (!existing) {
    throw AppError.BadRequest('Add a hero headline and save it before uploading an image');
  }
  const previousUrl = (existing as { image_url: string | null }).image_url;

  const uploaded = await uploadObject(SITE_IMAGES_BUCKET, 'hero', file);

  const { data, error } = await db
    .from('home_hero')
    .update({ image_url: uploaded.url })
    .eq('id', true)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    await removeObjects(SITE_IMAGES_BUCKET, [uploaded.path]); // roll back the orphaned upload
    if (error) fail('Failed to save hero image', error);
    throw AppError.NotFound('Hero not found');
  }

  if (previousUrl) await removeObjectByUrl(SITE_IMAGES_BUCKET, previousUrl);
  return toAdminHomeHeroDTO(data as never);
}

export async function createTile(input: TileCreate): Promise<AdminHomeTileDTO> {
  const { data, error } = await db
    .from('home_tiles')
    .insert({
      slot: input.slot,
      title: input.title,
      title_es: input.titleEs,
      body: input.body ?? null,
      body_es: input.bodyEs,
      icon: input.icon ?? null,
      image_url: input.imageUrl ?? null,
      href: input.href ?? null,
      sort_order: input.sortOrder ?? 0,
      is_published: input.isPublished,
    })
    .select('*')
    .single();
  if (error) fail('Failed to create tile', error);
  return toAdminHomeTileDTO(data as never);
}

export async function updateTile(id: string, input: TileUpdate): Promise<AdminHomeTileDTO> {
  const patch: Record<string, unknown> = {};
  if (input.slot !== undefined) patch.slot = input.slot;
  if (input.title !== undefined) patch.title = input.title;
  if (input.titleEs !== undefined) patch.title_es = input.titleEs;
  if (input.body !== undefined) patch.body = input.body;
  if (input.bodyEs !== undefined) patch.body_es = input.bodyEs;
  if (input.icon !== undefined) patch.icon = input.icon;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.href !== undefined) patch.href = input.href;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

  const { data, error } = await db
    .from('home_tiles')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) fail('Failed to update tile', error);
  if (!data) throw AppError.NotFound('Tile not found');
  return toAdminHomeTileDTO(data as never);
}

export async function deleteTile(id: string): Promise<void> {
  const { data: existing, error: exErr } = await db
    .from('home_tiles')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load tile', exErr);
  if (!existing) throw AppError.NotFound('Tile not found');

  const { error } = await db.from('home_tiles').delete().eq('id', id);
  if (error) fail('Failed to delete tile', error);

  const url = (existing as { image_url: string | null }).image_url;
  if (url) await removeObjectByUrl(SITE_IMAGES_BUCKET, url);
}

export async function setTileImage(id: string, file: UploadedFile): Promise<AdminHomeTileDTO> {
  const { data: existing, error: exErr } = await db
    .from('home_tiles')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load tile', exErr);
  if (!existing) throw AppError.NotFound('Tile not found');
  const previousUrl = (existing as { image_url: string | null }).image_url;

  const uploaded = await uploadObject(SITE_IMAGES_BUCKET, 'tiles', file);

  const { data, error } = await db
    .from('home_tiles')
    .update({ image_url: uploaded.url })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    await removeObjects(SITE_IMAGES_BUCKET, [uploaded.path]);
    if (error) fail('Failed to save tile image', error);
    throw AppError.NotFound('Tile not found');
  }

  if (previousUrl) await removeObjectByUrl(SITE_IMAGES_BUCKET, previousUrl);
  return toAdminHomeTileDTO(data as never);
}

// ===========================================================================
// Store locations
// ===========================================================================

export async function listAdminLocations(): Promise<AdminStoreLocationDTO[]> {
  const { data, error } = await db
    .from('store_locations')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) fail('Failed to list locations', error);
  return (data as StoreLocationRow[]).map(toAdminStoreLocationDTO);
}

export async function createLocation(input: LocationCreate): Promise<AdminStoreLocationDTO> {
  const { data, error } = await db
    .from('store_locations')
    .insert({
      name: input.name,
      name_es: input.nameEs,
      address: input.address,
      phone: input.phone ?? null,
      hours: input.hours ?? null,
      hours_es: input.hoursEs,
      map_url: input.mapUrl ?? null,
      image_url: input.imageUrl ?? null,
      sort_order: input.sortOrder ?? 0,
      is_published: input.isPublished,
    })
    .select('*')
    .single();
  if (error) {
    if (error.code === '23505') throw AppError.Conflict('A location with that address already exists');
    fail('Failed to create location', error);
  }
  return toAdminStoreLocationDTO(data as never);
}

export async function updateLocation(
  id: string,
  input: LocationUpdate,
): Promise<AdminStoreLocationDTO> {
  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.nameEs !== undefined) patch.name_es = input.nameEs;
  if (input.address !== undefined) patch.address = input.address;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.hours !== undefined) patch.hours = input.hours;
  if (input.hoursEs !== undefined) patch.hours_es = input.hoursEs;
  if (input.mapUrl !== undefined) patch.map_url = input.mapUrl;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

  const { data, error } = await db
    .from('store_locations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) {
    if (error.code === '23505') throw AppError.Conflict('A location with that address already exists');
    fail('Failed to update location', error);
  }
  if (!data) throw AppError.NotFound('Location not found');
  return toAdminStoreLocationDTO(data as never);
}

export async function deleteLocation(id: string): Promise<void> {
  const { data: existing, error: exErr } = await db
    .from('store_locations')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load location', exErr);
  if (!existing) throw AppError.NotFound('Location not found');

  const { error } = await db.from('store_locations').delete().eq('id', id);
  if (error) fail('Failed to delete location', error);

  const url = (existing as { image_url: string | null }).image_url;
  if (url) await removeObjectByUrl(SITE_IMAGES_BUCKET, url);
}

export async function setLocationImage(
  id: string,
  file: UploadedFile,
): Promise<AdminStoreLocationDTO> {
  const { data: existing, error: exErr } = await db
    .from('store_locations')
    .select('id, image_url')
    .eq('id', id)
    .maybeSingle();
  if (exErr) fail('Failed to load location', exErr);
  if (!existing) throw AppError.NotFound('Location not found');
  const previousUrl = (existing as { image_url: string | null }).image_url;

  const uploaded = await uploadObject(SITE_IMAGES_BUCKET, 'locations', file);

  const { data, error } = await db
    .from('store_locations')
    .update({ image_url: uploaded.url })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error || !data) {
    await removeObjects(SITE_IMAGES_BUCKET, [uploaded.path]);
    if (error) fail('Failed to save location image', error);
    throw AppError.NotFound('Location not found');
  }

  if (previousUrl) await removeObjectByUrl(SITE_IMAGES_BUCKET, previousUrl);
  return toAdminStoreLocationDTO(data as never);
}

// ===========================================================================
// Orphan image cleanup
// ===========================================================================

/** Collect every non-null URL stored in one column, as storage paths in `bucket`. */
async function refPathsFrom(bucket: Bucket, table: string, column: string): Promise<string[]> {
  const { data, error } = await db.from(table).select(column).not(column, 'is', null);
  if (error) fail(`Failed to load image references from ${table}.${column}`, error);
  return (data ?? [])
    .map((r) => (r as unknown as Record<string, string | null>)[column])
    .filter((url): url is string => typeof url === 'string' && url.length > 0)
    .map((url) => pathFromPublicUrl(bucket, url))
    .filter((p): p is string => p !== null);
}

interface Sweep {
  bucket: Bucket;
  refs: () => Promise<string[]>;
}

/**
 * Every column that can reference an object in `site-images`, unioned.
 *
 * This list IS the safety property for that bucket: it holds the hero, the
 * homepage tiles and the branch photos, so dropping one source here does not
 * degrade the sweep, it deletes live site content — a missing `home_hero` entry
 * means the next sweep removes the hero image. Adding any new table or column
 * that stores a site-images URL means adding it here in the same commit.
 * `test/orphans.test.ts` pins all three.
 *
 * Deliberately NOT wrapped in try/catch: refPathsFrom throws on a query error,
 * and aborting the whole sweep is the only safe response to an incomplete
 * reference set. Sweeping with two of three sources is the exact failure this
 * function exists to prevent.
 */
async function siteImageRefs(): Promise<string[]> {
  const sources: Array<[table: string, column: string]> = [
    ['home_hero', 'image_url'],
    ['home_tiles', 'image_url'],
    ['store_locations', 'image_url'],
  ];
  const perSource = await Promise.all(
    sources.map(([table, column]) => refPathsFrom(SITE_IMAGES_BUCKET, table, column)),
  );
  return perSource.flat();
}

/**
 * Buckets the orphan sweep is allowed to touch, each paired with EVERY column
 * that can reference an object in it. A bucket swept without a complete
 * reference source deletes live site content.
 *
 * `site-images` spans three tables, which is why it was excluded until its
 * reference sources were all registered — see siteImageRefs above, which is now
 * that complete set.
 *
 * `category-images` (0013) is the easy case, and that is the whole reason it is
 * its own bucket rather than a folder in site-images: categories.image_url is
 * the single column that can reference it, for parents and subcategories alike.
 * Externally-hosted seed URLs resolve to null through pathFromPublicUrl, so the
 * sweep can never reach them.
 */
const SWEEPS: Sweep[] = [
  { bucket: PRODUCT_IMAGES_BUCKET, refs: () => refPathsFrom(PRODUCT_IMAGES_BUCKET, 'product_images', 'url') },
  { bucket: BRAND_LOGOS_BUCKET, refs: () => refPathsFrom(BRAND_LOGOS_BUCKET, 'brands', 'logo_url') },
  { bucket: CATEGORY_IMAGES_BUCKET, refs: () => refPathsFrom(CATEGORY_IMAGES_BUCKET, 'categories', 'image_url') },
  { bucket: SITE_IMAGES_BUCKET, refs: siteImageRefs },
];

/**
 * Delete objects no row references any more. IRREVERSIBLE — `dryRun` resolves
 * the identical list and deletes nothing, which is what lets the admin UI show
 * a real file list before asking for confirmation.
 */
export async function cleanupOrphans(dryRun = false): Promise<OrphanCleanupResult> {
  const deletedPaths: string[] = [];

  for (const sweep of SWEEPS) {
    const allPaths = await listAllObjectPaths(sweep.bucket);
    if (allPaths.length === 0) continue;

    const referenced = new Set(await sweep.refs());

    // Tripwire: zero references against a non-empty bucket almost certainly
    // means the reference query broke (a renamed column, a dropped table) —
    // not that every object is genuinely unused. Refuse rather than empty the
    // bucket; ten lines that turn a catastrophe into a log line.
    if (referenced.size === 0) {
      logger.warn(
        { bucket: sweep.bucket, objects: allPaths.length },
        'orphan sweep skipped: reference query returned no URLs for a non-empty bucket',
      );
      continue;
    }

    const orphans = allPaths.filter((p) => !referenced.has(p));
    if (!dryRun) await removeObjects(sweep.bucket, orphans);
    deletedPaths.push(...orphans.map((p) => `${sweep.bucket}/${p}`));
  }

  return { deleted: deletedPaths.length, paths: deletedPaths, dryRun };
}

// ===========================================================================
// Orders (read + status transitions only — creation is the public checkout
// flow in modules/orders). Re-exported here rather than duplicated so the
// admin router can import everything from this one service module like every
// other section above, without a second copy of the order-fetching logic.
// ===========================================================================

// ===========================================================================
// Users
// ===========================================================================

/**
 * Reads `profiles` only — never auth.users. Everything the list shows (email,
 * name, role, active, created) lives on the profile row, and merging in a
 * separately paginated db.auth.admin.listUsers() to surface confirmation state
 * would mean reconciling two pagers. Deliberate omission.
 */
export async function listAdminUsers(
  params: AdminUserListQuery,
): Promise<Paginated<AdminUserListItem>> {
  let query = db
    .from('profiles')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params.role) query = query.eq('role', params.role);
  if (params.q) {
    const term = `%${params.q}%`;
    query = query.or(`email.ilike.${term},full_name.ilike.${term}`);
  }

  const from = (params.page - 1) * params.pageSize;
  query = query.range(from, from + params.pageSize - 1);

  const { data, error, count } = await query;
  if (error) fail('Failed to list users', error);

  const rows = (data ?? []) as ProfileRow[];
  return {
    items: rows.map(toAdminUserListItem),
    total: count ?? rows.length,
    page: params.page,
    pageSize: params.pageSize,
  };
}

/**
 * Create an account from the back office. `email_confirm: true` — no email is
 * sent and no link is needed: the admin types the password and hands it over
 * out of band. That is the whole difference from the public signup flow, which
 * emails a link and leaves the account unconfirmed until it is opened.
 *
 * The on_auth_user_created trigger writes the `profiles` row (with `full_name`
 * from user_metadata, role 'customer'), so the only thing left to do here is
 * promote it when an admin was requested.
 */
export async function createUser(input: UserCreate): Promise<AdminUserListItem> {
  const { data, error } = await db.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: input.fullName ? { full_name: input.fullName } : {},
  });

  if (error) {
    if (isEmailTaken(error)) throw AppError.Conflict('An account with this email already exists.');
    fail('Failed to create user', error);
  }

  const id = (data as { user?: { id?: string } } | null)?.user?.id;
  if (!id) fail('Failed to create user', { message: 'no user returned' });

  const profiles = db.from('profiles');
  const { data: row, error: profileErr } =
    input.role === 'admin'
      ? await profiles.update({ role: 'admin' }).eq('id', id).select('*').maybeSingle()
      : await profiles.select('*').eq('id', id).maybeSingle();

  if (profileErr) fail('Failed to load the new user profile', profileErr);
  if (!row) fail('Failed to load the new user profile', { message: 'profile row missing' });

  return toAdminUserListItem(row as ProfileRow);
}

/**
 * Activate/deactivate. Both requireAuth and requireRole re-read the profile on
 * every request (middleware/auth.ts), so deactivating takes effect on the
 * target's very next call — their existing cookies stop working without any
 * token revocation.
 */
export async function setUserActive(id: string, isActive: boolean): Promise<AdminUserListItem> {
  const { data, error } = await db
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) fail('Failed to update user', error);
  if (!data) throw AppError.NotFound('User not found');
  return toAdminUserListItem(data as ProfileRow);
}

export { listAdminOrders, getAdminOrder, updateOrderStatus } from '../orders/service.js';
