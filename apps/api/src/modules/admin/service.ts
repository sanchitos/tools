import type {
  AdminBrandDTO,
  AdminCategoryDTO,
  AdminProductDTO,
  AdminProductListItem,
  OrphanCleanupResult,
  Paginated,
  ProductImageDTO,
} from '@tools-jamaica/shared';
import { db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import { slugify } from '../../lib/slug.js';
import {
  listAllObjectPaths,
  pathFromPublicUrl,
  removeObjectByUrl,
  removeObjects,
  uploadProductImage,
  type UploadedFile,
} from '../../lib/storage.js';
import { toImageDTO } from '../catalog/mappers.js';
import type {
  ProductDetailRelations,
  ProductWithRelations,
} from '../catalog/mappers.js';
import {
  toAdminBrandDTO,
  toAdminCategoryDTO,
  toAdminProductDTO,
  toAdminProductListItem,
} from './mappers.js';
import type {
  AdminProductListQuery,
  BrandCreate,
  BrandUpdate,
  CategoryCreate,
  CategoryUpdate,
  ImageUploadMeta,
  ProductCreate,
  ProductUpdate,
  ReorderInput,
} from './schema.js';

const LIST_SELECT = `
  id, slug, name, brand_id, category_id, short_description, description,
  price, currency, stock, sku, featured, is_published, rating, review_count,
  created_at, updated_at,
  brand:brands ( id, name, slug, logo_url ),
  category:categories ( id, slug, label ),
  images:product_images ( id, product_id, url, is_primary, alt_text, sort_order, created_at )
`;

const DETAIL_SELECT = `${LIST_SELECT},
  specs:product_specs ( id, product_id, label, value, sort_order ),
  highlights:product_highlights ( id, product_id, text, sort_order )`;

function fail(message: string, error: { message: string; code?: string }): never {
  throw AppError.Internal(message, error.message);
}

function isFkViolation(error: { code?: string } | null): boolean {
  return error?.code === '23503';
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
      .select('id')
      .eq('slug', params.category)
      .maybeSingle();
    query = query.eq('category_id', (cat as { id: string } | null)?.id ?? '0');
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
      value: s.value,
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
      sort_order: h.sortOrder ?? i,
    }));
    const ins = await db.from('product_highlights').insert(rows);
    if (ins.error) fail('Failed to insert highlights', ins.error);
  }
}

export async function createProduct(input: ProductCreate): Promise<AdminProductDTO> {
  const slug = await ensureUniqueSlug('products', slugify(input.slug ?? input.name));

  const { data, error } = await db
    .from('products')
    .insert({
      slug,
      name: input.name,
      brand_id: input.brandId ?? null,
      category_id: input.categoryId,
      short_description: input.shortDescription ?? null,
      description: input.description ?? null,
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
  return getAdminProduct(id);
}

export async function updateProduct(id: string, input: ProductUpdate): Promise<AdminProductDTO> {
  await getAdminProduct(id); // 404 if missing

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.slug !== undefined) {
    patch.slug = await ensureUniqueSlug('products', slugify(input.slug), id);
  }
  if (input.categoryId !== undefined) patch.category_id = input.categoryId;
  if (input.brandId !== undefined) patch.brand_id = input.brandId;
  if (input.shortDescription !== undefined) patch.short_description = input.shortDescription;
  if (input.description !== undefined) patch.description = input.description;
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
    .map((r) => pathFromPublicUrl((r as { url: string }).url))
    .filter((p): p is string => p !== null);
  await removeObjects(paths);
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
      await removeObjects([uploaded.path]);
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
    await removeObjects([uploaded.path]); // roll back the orphaned upload
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

  await removeObjectByUrl(url);

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
  return (data ?? []).map((r) => toAdminCategoryDTO(r as never));
}

export async function createCategory(input: CategoryCreate): Promise<AdminCategoryDTO> {
  const slug = await ensureUniqueSlug('categories', slugify(input.slug ?? input.label));
  const { data, error } = await db
    .from('categories')
    .insert({
      slug,
      label: input.label,
      image_url: input.imageUrl ?? null,
      sort_order: input.sortOrder ?? 0,
      is_published: input.isPublished,
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
  const patch: Record<string, unknown> = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.slug !== undefined) patch.slug = await ensureUniqueSlug('categories', slugify(input.slug), id);
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isPublished !== undefined) patch.is_published = input.isPublished;

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
  const { data: existing } = await db.from('categories').select('id').eq('id', id).maybeSingle();
  if (!existing) throw AppError.NotFound('Category not found');

  const { error } = await db.from('categories').delete().eq('id', id);
  if (error) {
    if (isFkViolation(error)) {
      throw AppError.Conflict('Category still has products; reassign or delete them first');
    }
    fail('Failed to delete category', error);
  }
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
  const { data: existing } = await db.from('brands').select('id').eq('id', id).maybeSingle();
  if (!existing) throw AppError.NotFound('Brand not found');
  const { error } = await db.from('brands').delete().eq('id', id); // products.brand_id -> null
  if (error) fail('Failed to delete brand', error);
}

// ===========================================================================
// Orphan image cleanup
// ===========================================================================

export async function cleanupOrphans(): Promise<OrphanCleanupResult> {
  const allPaths = await listAllObjectPaths();

  const { data, error } = await db.from('product_images').select('url');
  if (error) fail('Failed to load image references', error);

  const referenced = new Set(
    (data ?? [])
      .map((r) => pathFromPublicUrl((r as { url: string }).url))
      .filter((p): p is string => p !== null),
  );

  const orphans = allPaths.filter((p) => !referenced.has(p));
  await removeObjects(orphans);
  return { deleted: orphans.length, paths: orphans };
}
