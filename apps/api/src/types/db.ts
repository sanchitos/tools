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
  created_at: string;
  updated_at: string;
}

export interface CategoryRow {
  id: string;
  slug: string;
  label: string;
  image_url: string | null;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  brand_id: string | null;
  category_id: string | null;
  short_description: string | null;
  description: string | null;
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
  /** Generated column (0005_search.sql); never selected explicitly, kept here for honesty. */
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
  value: string;
  sort_order: number;
}

export interface ProductHighlightRow {
  id: string;
  product_id: string;
  text: string;
  sort_order: number;
}

export interface OrderRow {
  id: string;
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
