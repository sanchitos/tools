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
/**
 * Site languages. Content carries `_es` sibling columns; the API resolves the
 * language server-side, so the *public* DTOs below stay single-valued strings.
 * Only the admin DTOs expose the `*Es` fields, for editing.
 */
export type Locale = 'en' | 'es';

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
  /** Top-level category when null; otherwise the parent's id (two-level hierarchy). */
  parentId: string | null;
  /**
   * Count of published products in this category (when requested). For a
   * top-level category this rolls up its subcategories' counts too, since
   * filtering by a parent includes its children's products.
   */
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

export interface AdminProductSpecDTO extends ProductSpecDTO {
  labelEs: string | null;
  valueEs: string | null;
}

export interface AdminProductHighlightDTO extends ProductHighlightDTO {
  textEs: string | null;
}

export interface AdminProductDTO extends ProductDetailDTO {
  isPublished: boolean;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Spanish siblings — null means "not translated yet" (falls back to English). */
  nameEs: string | null;
  shortDescriptionEs: string | null;
  descriptionEs: string | null;
  specs: AdminProductSpecDTO[];
  highlights: AdminProductHighlightDTO[];
}

export interface AdminCategoryDTO extends CategoryDTO {
  sortOrder: number;
  isPublished: boolean;
  labelEs: string | null;
}

export interface AdminBrandDTO extends BrandDTO {
  sortOrder: number;
  /** Shown in the homepage brand rail. Brand names themselves are never translated. */
  isFeatured: boolean;
}

/** Lightweight row for the admin products list (no specs/highlights/related). */
export interface AdminProductListItem extends ProductSummaryDTO {
  isPublished: boolean;
  brandId: string | null;
  categoryId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Drives the "No ES" badge in the admin list. */
  nameEs: string | null;
}

/** Result of the orphan-image sweep. */
export interface OrphanCleanupResult {
  /** Objects deleted — or, on a dry run, the number that would be. */
  deleted: number;
  paths: string[];
  /** True when nothing was actually removed. */
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Homepage content (admin-editable) + store locations
// ---------------------------------------------------------------------------

/**
 * Where a tile renders on the homepage:
 *  - `promo`   the two image cards beside the hero
 *  - `service` the icon-only trust row
 *  - `ticker`  the marquee strip (title only)
 */
export type HomeTileSlot = 'promo' | 'service' | 'ticker';

export interface HomeHeroDTO {
  imageUrl: string | null;
  eyebrow: string | null;
  headline: string;
  subcopy: string | null;
  ctaLabel: string | null;
  ctaHref: string;
}

export interface HomeTileDTO {
  id: string;
  slot: HomeTileSlot;
  title: string;
  body: string | null;
  /** An `IconName` from the web's ui/Icon; used when `imageUrl` is null. */
  icon: string | null;
  imageUrl: string | null;
  href: string | null;
  sortOrder: number;
}

export interface StoreLocationDTO {
  id: string;
  name: string;
  /** Never translated — an address is an address. */
  address: string;
  phone: string | null;
  hours: string | null;
  mapUrl: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

/**
 * One payload for the whole homepage. The page already fired three requests
 * before it was editable; splitting these per block would take it to eight.
 */
export interface HomeContentDTO {
  hero: HomeHeroDTO | null;
  promos: HomeTileDTO[];
  services: HomeTileDTO[];
  ticker: HomeTileDTO[];
  featuredBrands: BrandDTO[];
  locations: StoreLocationDTO[];
}

// --- Admin supersets (the `_es` editing surface + unpublished rows) ---------

export interface AdminHomeHeroDTO extends HomeHeroDTO {
  eyebrowEs: string | null;
  headlineEs: string | null;
  subcopyEs: string | null;
  ctaLabelEs: string | null;
}

export interface AdminHomeTileDTO extends HomeTileDTO {
  titleEs: string | null;
  bodyEs: string | null;
  isPublished: boolean;
}

export interface AdminStoreLocationDTO extends StoreLocationDTO {
  nameEs: string | null;
  hoursEs: string | null;
  isPublished: boolean;
}

/** GET /admin/home — every tile, all slots, unpublished included. */
export interface AdminHomeContentDTO {
  hero: AdminHomeHeroDTO | null;
  tiles: AdminHomeTileDTO[];
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

// ---------------------------------------------------------------------------
// Orders (guest cart checkout — Phase 1: no payments, no customer accounts)
// ---------------------------------------------------------------------------

export type OrderStatus = 'new' | 'confirmed' | 'fulfilled' | 'cancelled';
export type Fulfillment = 'pickup' | 'delivery';

/** A line item as it was AT ORDER TIME — a snapshot, not a live product join. */
export interface OrderItemDTO {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productSlug: string | null;
  imageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  fulfillment: Fulfillment;
  deliveryAddress: string | null;
  notes: string | null;
  subtotal: number;
  currency: Currency;
  status: OrderStatus;
  items: OrderItemDTO[];
  createdAt: string;
  updatedAt: string;
}

/**
 * What the browser is allowed to send to POST /orders. Deliberately carries no
 * price or total — the server re-reads each product and prices the order
 * itself via resolvePrice(); a client-supplied price is never trusted.
 */
export interface CreateOrderRequest {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillment: Fulfillment;
  deliveryAddress?: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
}

/** Lightweight row for the admin orders list (no line items — itemCount instead). */
export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  itemCount: number;
  subtotal: number;
  currency: Currency;
  status: OrderStatus;
  createdAt: string;
}
