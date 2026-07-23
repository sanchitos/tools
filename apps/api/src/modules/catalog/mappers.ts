import type {
  BrandDTO,
  CategoryDTO,
  ProductDetailDTO,
  ProductHighlightDTO,
  ProductImageDTO,
  ProductSpecDTO,
  ProductSummaryDTO,
} from '@tools-jamaica/shared';
import type {
  BrandRow,
  CategoryRow,
  ProductHighlightRow,
  ProductImageRow,
  ProductRow,
  ProductSpecRow,
} from '../../types/db.js';
import { resolvePrice } from '../../lib/pricing.js';

/** Product row with the embedded relations we select in service.ts. */
export interface ProductWithRelations extends ProductRow {
  brand: BrandRow | null;
  category: Pick<CategoryRow, 'id' | 'slug' | 'label'> | null;
  images: ProductImageRow[] | null;
}

export interface ProductDetailRelations extends ProductWithRelations {
  specs: ProductSpecRow[] | null;
  highlights: ProductHighlightRow[] | null;
}

export function toBrandDTO(row: BrandRow): BrandDTO {
  return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url };
}

export function toCategoryDTO(row: CategoryRow, productCount?: number): CategoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    label: row.label,
    imageUrl: row.image_url,
    ...(productCount !== undefined ? { productCount } : {}),
  };
}

export function toImageDTO(row: ProductImageRow): ProductImageDTO {
  return {
    id: row.id,
    url: row.url,
    isPrimary: row.is_primary,
    altText: row.alt_text,
    sortOrder: row.sort_order,
  };
}

const bySort = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

function pickPrimary(images: ProductImageRow[]): ProductImageRow | null {
  if (images.length === 0) return null;
  return images.find((i) => i.is_primary) ?? [...images].sort(bySort)[0] ?? null;
}

/** Compact DTO for lists/grids. Admin-only fields (is_published, sort_order…) omitted. */
export function toProductSummaryDTO(p: ProductWithRelations): ProductSummaryDTO {
  const images = p.images ?? [];
  const primary = pickPrimary(images);
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortDescription: p.short_description,
    price: resolvePrice(p),
    currency: p.currency,
    stock: p.stock,
    featured: p.featured,
    rating: Number(p.rating),
    reviewCount: p.review_count,
    brand: p.brand ? toBrandDTO(p.brand) : null,
    category: p.category
      ? { id: p.category.id, slug: p.category.slug, label: p.category.label }
      : null,
    primaryImage: primary ? toImageDTO(primary) : null,
  };
}

function toSpecDTO(row: ProductSpecRow): ProductSpecDTO {
  return { id: row.id, label: row.label, value: row.value, sortOrder: row.sort_order };
}

function toHighlightDTO(row: ProductHighlightRow): ProductHighlightDTO {
  return { id: row.id, text: row.text, sortOrder: row.sort_order };
}

/** Full DTO for the product detail page. */
export function toProductDetailDTO(
  p: ProductDetailRelations,
  related: ProductSummaryDTO[],
): ProductDetailDTO {
  const images = [...(p.images ?? [])].sort(bySort);
  const specs = [...(p.specs ?? [])].sort(bySort);
  const highlights = [...(p.highlights ?? [])].sort(bySort);
  return {
    ...toProductSummaryDTO(p),
    description: p.description,
    sku: p.sku,
    images: images.map(toImageDTO),
    specs: specs.map(toSpecDTO),
    highlights: highlights.map(toHighlightDTO),
    related,
  };
}
