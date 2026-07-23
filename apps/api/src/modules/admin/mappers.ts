import type {
  AdminBrandDTO,
  AdminCategoryDTO,
  AdminProductDTO,
  AdminProductListItem,
} from '@tools-jamaica/shared';
import type { BrandRow, CategoryRow } from '../../types/db.js';
import {
  toProductDetailDTO,
  toProductSummaryDTO,
  type ProductDetailRelations,
  type ProductWithRelations,
} from '../catalog/mappers.js';

export function toAdminBrandDTO(row: BrandRow): AdminBrandDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url,
    sortOrder: row.sort_order,
  };
}

export function toAdminCategoryDTO(row: CategoryRow): AdminCategoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    imageUrl: row.image_url,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
  };
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
  };
}

/** Compact admin list row. */
export function toAdminProductListItem(p: ProductWithRelations): AdminProductListItem {
  return {
    ...toProductSummaryDTO(p),
    isPublished: p.is_published,
    sku: p.sku,
    brandId: p.brand_id,
    categoryId: p.category_id,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}
