/**
 * @tools-jamaica/shared — canonical DTO types.
 *
 * The single source of truth for the shapes that cross the web <-> api boundary.
 * Consumed from source (no build step). Add a field here first, then wire it in
 * the api module `mappers.ts` and the row type in `apps/api/src/types/db.ts`.
 *
 * These DTOs are intentionally cart/checkout-compatible: a product carries
 * everything a future cart line would need to snapshot (price, currency, sku,
 * name, primary image). Building the cart later is additive, not a refactor.
 */

// ---------------------------------------------------------------------------
// Envelopes
// ---------------------------------------------------------------------------

/** Consistent pagination envelope returned by list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Error envelope returned by the API on any failure. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type Currency = 'JMD';
export type Locale = 'en';

// ---------------------------------------------------------------------------
// Catalog — public DTOs (admin-only fields stripped)
// ---------------------------------------------------------------------------

export interface BrandDTO {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
}

export interface CategoryDTO {
  id: string;
  slug: string;
  label: string;
  imageUrl: string | null;
  /** Count of published products in this category (when requested). */
  productCount?: number;
}

export interface ProductImageDTO {
  id: string;
  url: string;
  isPrimary: boolean;
  altText: string | null;
  sortOrder: number;
}

export interface ProductSpecDTO {
  id: string;
  label: string;
  value: string;
  sortOrder: number;
}

export interface ProductHighlightDTO {
  id: string;
  text: string;
  sortOrder: number;
}

/** Compact product shape for list/grid views (Shop page, featured rail). */
export interface ProductSummaryDTO {
  id: string;
  slug: string;
  name: string;
  sku: string | null;
  shortDescription: string | null;
  price: number;
  currency: Currency;
  stock: number;
  featured: boolean;
  rating: number;
  reviewCount: number;
  brand: BrandDTO | null;
  category: Pick<CategoryDTO, 'id' | 'slug' | 'label'> | null;
  primaryImage: ProductImageDTO | null;
}

/** Full product shape for the detail page. */
export interface ProductDetailDTO extends ProductSummaryDTO {
  description: string | null;
  images: ProductImageDTO[];
  specs: ProductSpecDTO[];
  highlights: ProductHighlightDTO[];
  related: ProductSummaryDTO[];
}

// ---------------------------------------------------------------------------
// Catalog — query params (Shop page, URL-synced)
// ---------------------------------------------------------------------------

export type ProductSort = 'featured' | 'price-asc' | 'price-desc' | 'name' | 'relevance';

export interface ProductListQuery {
  category?: string[];
  brand?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  q?: string;
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Auth (admin this phase; role is forward-compatible with customers later)
// ---------------------------------------------------------------------------

export type Role = 'admin' | 'customer';

export interface ProfileDTO {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ---------------------------------------------------------------------------
// Admin DTOs (superset — includes fields stripped from public output)
// ---------------------------------------------------------------------------

export interface AdminProductDTO extends ProductDetailDTO {
  isPublished: boolean;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCategoryDTO extends CategoryDTO {
  sortOrder: number;
  isPublished: boolean;
}

export interface AdminBrandDTO extends BrandDTO {
  sortOrder: number;
}

/** Lightweight row for the admin products list (no specs/highlights/related). */
export interface AdminProductListItem extends ProductSummaryDTO {
  isPublished: boolean;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of the orphan-image sweep. */
export interface OrphanCleanupResult {
  deleted: number;
  paths: string[];
}

// ---------------------------------------------------------------------------
// Agent DTOs (machine-to-machine catalog search, e.g. the WhatsApp agent)
// ---------------------------------------------------------------------------

/**
 * Deliberately lean, unlike ProductSummaryDTO: no id, images, rating,
 * reviewCount, or nested brand/category objects — those cost real tokens on
 * every agent turn for data an LLM answer never uses. `url` lets the agent
 * link the product on the storefront.
 */
export interface AgentProductDTO {
  name: string;
  sku: string | null;
  price: number;
  currency: Currency;
  inStock: boolean;
  stockCount: number;
  brand: string | null;
  category: string | null;
  shortDescription: string | null;
  url: string;
}

export interface AgentSearchResult {
  items: AgentProductDTO[];
  total: number;
  /**
   * Populated only when `total` is 0, so a caller has something true to
   * offer ("we don't carry that, but we do have X") instead of the model
   * inventing a product to fill the silence.
   */
  categories?: Array<Pick<CategoryDTO, 'slug' | 'label'>>;
}
