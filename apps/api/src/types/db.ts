import type { Role } from '@tools-jamaica/shared';

/**
 * Postgres row shapes (snake_case), mirroring apps/api/supabase/migrations.
 * These are the *raw* DB rows; module `mappers.ts` convert them into the
 * camelCase DTOs in @tools-jamaica/shared. Keep in sync when the schema changes
 * (or regenerate later with `generate_typescript_types` once migrations are
 * applied to the remote project).
 */

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface BrandRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  sort_order: number;
  /** Brand names are proper nouns — never translated (0009_i18n_content.sql). */
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  slug: string;
  label: string;
  label_es: string | null;
  image_url: string | null;
  parent_id: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  /** Spanish siblings (0009): NULL = not translated, API falls back to English. */
  name_es: string | null;
  brand_id: string | null;
  category_id: string | null;
  short_description: string | null;
  short_description_es: string | null;
  description: string | null;
  description_es: string | null;
  price: string; // NUMERIC comes back as string from supabase-js
  currency: 'JMD';
  stock: number;
  sku: string | null;
  featured: boolean;
  is_published: boolean;
  rating: string; // NUMERIC
  review_count: number;
  created_at: string;
  updated_at: string;
  /** Generated column (0009_i18n_content.sql); never selected explicitly, kept here for honesty. */
  search_vector?: string;
}

export interface ProductImageRow {
  id: string;
  product_id: string;
  url: string;
  is_primary: boolean;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductSpecRow {
  id: string;
  product_id: string;
  label: string;
  label_es: string | null;
  value: string;
  value_es: string | null;
  sort_order: number;
}

export interface ProductHighlightRow {
  id: string;
  product_id: string;
  text: string;
  text_es: string | null;
  sort_order: number;
}

/**
 * product <-> subcategory tags (0012). No surrogate id: the PK is the pair.
 * `category_id` always points at a category with a non-null `parent_id`, and
 * that parent is the product's own `category_id` — enforced by the API
 * (validateTaxonomy), not the DB.
 */
export interface ProductSubcategoryRow {
  product_id: string;
  category_id: string;
  created_at: string;
}

export interface OrderRow {
  id: string;
  /** The account that placed it (0011); NULL for a guest order. */
  user_id: string | null;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfillment: 'pickup' | 'delivery';
  delivery_address: string | null;
  notes: string | null;
  subtotal: string; // NUMERIC comes back as string from supabase-js
  currency: 'JMD';
  status: 'new' | 'confirmed' | 'fulfilled' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_sku: string | null;
  product_slug: string | null;
  image_url: string | null;
  unit_price: string; // NUMERIC
  quantity: number;
  line_total: string; // NUMERIC
  created_at: string;
}

// --- Homepage content (0010_homepage_content.sql) --------------------------

/** Singleton: exactly one row, `id` is always true. */
export interface HomeHeroRow {
  id: boolean;
  image_url: string | null;
  eyebrow: string | null;
  eyebrow_es: string | null;
  headline: string;
  headline_es: string | null;
  subcopy: string | null;
  subcopy_es: string | null;
  cta_label: string | null;
  cta_label_es: string | null;
  cta_href: string;
  created_at: string;
  updated_at: string;
}

export interface HomeTileRow {
  id: string;
  slot: 'promo' | 'service' | 'ticker';
  title: string;
  title_es: string | null;
  body: string | null;
  body_es: string | null;
  /** An IconName from the web's ui/Icon; validated in the admin zod schema. */
  icon: string | null;
  image_url: string | null;
  href: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface StoreLocationRow {
  id: string;
  name: string;
  name_es: string | null;
  /** Never translated. */
  address: string;
  phone: string | null;
  hours: string | null;
  hours_es: string | null;
  map_url: string | null;
  image_url: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}
