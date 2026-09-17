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
  ProductSubcategoryRow,
} from '../../types/db.js';
import { resolvePrice } from '../../lib/pricing.js';
import { DEFAULT_LOCALE, pick, pickNullable, type Locale } from '../../lib/locale.js';

/*
 * Locale is a TRAILING, DEFAULTED parameter on every mapper that resolves an
 * `_es` column — never an ambient/AsyncLocalStorage value. admin/mappers.ts
 * calls toProductDetailDTO / toProductSummaryDTO directly, so an ambient locale
 * would flow straight into the admin DTOs and the product editor would then
 * save Spanish text over the English columns. "Admin gets English" is enforced
 * here simply by not passing an argument. Do not "simplify" this away.
 */

/** Product row with the embedded relations we select in service.ts. */
export interface ProductWithRelations extends ProductRow {
  brand: BrandRow | null;
  category: Pick<CategoryRow, 'id' | 'slug' | 'label' | 'label_es'> | null;
  images: ProductImageRow[] | null;
  /**
   * The `product_subcategories` junction rows, embedded by table name (0012).
   * Only the admin selects ask for it; the public DTOs expose no subcategories,
   * so this is `undefined` on a catalog read.
   */
  subcategories?: Pick<ProductSubcategoryRow, 'category_id'>[] | null;
}

export interface ProductDetailRelations extends ProductWithRelations {
  specs: ProductSpecRow[] | null;
  highlights: ProductHighlightRow[] | null;
}

export function toBrandDTO(row: BrandRow): BrandDTO {
  return { id: row.id, name: row.name, slug: row.slug, logoUrl: row.logo_url };
}

export function toCategoryDTO(
  row: CategoryRow,
  productCount?: number,
  locale: Locale = DEFAULT_LOCALE,
): CategoryDTO {
  return {
    id: row.id,
    slug: row.slug,
    label: pick(locale, row.label, row.label_es),
    imageUrl: row.image_url,
    parentId: row.parent_id,
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
export function toProductSummaryDTO(
  p: ProductWithRelations,
  locale: Locale = DEFAULT_LOCALE,
): ProductSummaryDTO {
  const images = p.images ?? [];
  const primary = pickPrimary(images);
  return {
    id: p.id,
    slug: p.slug,
    name: pick(locale, p.name, p.name_es),
    sku: p.sku,
    shortDescription: pickNullable(locale, p.short_description, p.short_description_es),
    price: resolvePrice(p),
    currency: p.currency,
    stock: p.stock,
    featured: p.featured,
    rating: Number(p.rating),
    reviewCount: p.review_count,
    brand: p.brand ? toBrandDTO(p.brand) : null,
    category: p.category
      ? {
          id: p.category.id,
          slug: p.category.slug,
          label: pick(locale, p.category.label, p.category.label_es),
        }
      : null,
    primaryImage: primary ? toImageDTO(primary) : null,
  };
}

function toSpecDTO(row: ProductSpecRow, locale: Locale = DEFAULT_LOCALE): ProductSpecDTO {
  return {
    id: row.id,
    label: pick(locale, row.label, row.label_es),
    value: pick(locale, row.value, row.value_es),
    sortOrder: row.sort_order,
  };
}

function toHighlightDTO(
  row: ProductHighlightRow,
  locale: Locale = DEFAULT_LOCALE,
): ProductHighlightDTO {
  return { id: row.id, text: pick(locale, row.text, row.text_es), sortOrder: row.sort_order };
}

/** Full DTO for the product detail page. */
export function toProductDetailDTO(
  p: ProductDetailRelations,
  related: ProductSummaryDTO[],
  locale: Locale = DEFAULT_LOCALE,
): ProductDetailDTO {
  const images = [...(p.images ?? [])].sort(bySort);
  const specs = [...(p.specs ?? [])].sort(bySort);
  const highlights = [...(p.highlights ?? [])].sort(bySort);
  return {
    ...toProductSummaryDTO(p, locale), // sku already included here
    description: pickNullable(locale, p.description, p.description_es),
    images: images.map(toImageDTO),
    specs: specs.map((row) => toSpecDTO(row, locale)),
    highlights: highlights.map((row) => toHighlightDTO(row, locale)),
    related,
  };
}
