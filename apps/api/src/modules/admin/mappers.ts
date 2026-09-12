import type {
  AdminBrandDTO,
  AdminHomeHeroDTO,
  AdminHomeTileDTO,
  AdminStoreLocationDTO,
  AdminCategoryDTO,
  AdminProductDTO,
  AdminProductHighlightDTO,
  AdminProductListItem,
  AdminProductSpecDTO,
  AdminUserListItem,
} from '@tools-jamaica/shared';
import type {
  BrandRow,
  CategoryRow,
  ProfileRow,
  HomeHeroRow,
  HomeTileRow,
  ProductHighlightRow,
  ProductSpecRow,
  StoreLocationRow,
} from '../../types/db.js';
import { toHomeHeroDTO, toHomeTileDTO, toStoreLocationDTO } from '../catalog/homeMappers.js';
import {
  toProductDetailDTO,
  toProductSummaryDTO,
  type ProductDetailRelations,
  type ProductWithRelations,
} from '../catalog/mappers.js';

/*
 * Admin DTOs are ALWAYS English plus the raw `_es` fields, never locale-resolved:
 * the product editor writes back what it reads, so a localized admin DTO would
 * save Spanish text over the English columns. That is enforced simply by never
 * passing a locale to the catalog mappers below.
 */

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function toAdminBrandDTO(row: BrandRow): AdminBrandDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    sortOrder: row.sort_order,
    isFeatured: row.is_featured,
  };
}

export function toAdminCategoryDTO(row: CategoryRow): AdminCategoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    labelEs: row.label_es,
    imageUrl: row.image_url,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  };
}

function toAdminSpecDTO(row: ProductSpecRow): AdminProductSpecDTO {
  return {
    id: row.id,
    label: row.label,
    labelEs: row.label_es,
    value: row.value,
    valueEs: row.value_es,
    sortOrder: row.sort_order,
  };
}

function toAdminHighlightDTO(row: ProductHighlightRow): AdminProductHighlightDTO {
  return { id: row.id, text: row.text, textEs: row.text_es, sortOrder: row.sort_order };
}

/** Full admin product (detail + admin-only fields). `related` isn't needed here. */
export function toAdminProductDTO(p: ProductDetailRelations): AdminProductDTO {
  const base = toProductDetailDTO(p, []);
  return {
    ...base,
    isPublished: p.is_published,
    brandId: p.brand_id,
    categoryId: p.category_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    nameEs: p.name_es,
    shortDescriptionEs: p.short_description_es,
    descriptionEs: p.description_es,
    // Overwrite the public children with the admin variants, which carry the
    // `_es` columns the editor needs.
    specs: [...(p.specs ?? [])].sort(bySort).map(toAdminSpecDTO),
    highlights: [...(p.highlights ?? [])].sort(bySort).map(toAdminHighlightDTO),
  };
}

/** Compact admin list row. */
export function toAdminProductListItem(p: ProductWithRelations): AdminProductListItem {
  return {
    ...toProductSummaryDTO(p), // sku already included here
    isPublished: p.is_published,
    brandId: p.brand_id,
    categoryId: p.category_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    nameEs: p.name_es,
  };
}

// --- Homepage content + locations ------------------------------------------
// Each spreads the English-resolved public DTO (no locale argument — see the
// note above) and adds the raw `_es` columns the admin forms edit.

export function toAdminHomeHeroDTO(row: HomeHeroRow): AdminHomeHeroDTO {
  return {
    ...toHomeHeroDTO(row),
    eyebrowEs: row.eyebrow_es,
    headlineEs: row.headline_es,
    subcopyEs: row.subcopy_es,
    ctaLabelEs: row.cta_label_es,
  };
}

export function toAdminHomeTileDTO(row: HomeTileRow): AdminHomeTileDTO {
  return {
    ...toHomeTileDTO(row),
    titleEs: row.title_es,
    bodyEs: row.body_es,
    isPublished: row.is_published,
  };
}

export function toAdminStoreLocationDTO(row: StoreLocationRow): AdminStoreLocationDTO {
  return {
    ...toStoreLocationDTO(row),
    nameEs: row.name_es,
    hoursEs: row.hours_es,
    isPublished: row.is_published,
  };
}

// --- Users ------------------------------------------------------------------

/**
 * `profiles` only. Confirmation state (`email_confirmed_at`) lives on
 * auth.users and would need a separately paginated admin listUsers() merged in
 * — a deliberate omission, noted on AdminUserListItem in the shared package.
 */
export function toAdminUserListItem(row: ProfileRow): AdminUserListItem {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}
