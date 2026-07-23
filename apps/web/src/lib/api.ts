import type {
  AdminBrandDTO,
  AdminCategoryDTO,
  AdminProductDTO,
  AdminProductListItem,
  ApiErrorBody,
  BrandDTO,
  CategoryDTO,
  OrphanCleanupResult,
  Paginated,
  ProductDetailDTO,
  ProductImageDTO,
  ProductListQuery,
  ProductSummaryDTO,
  ProfileDTO,
} from '@tools-jamaica/shared';

/**
 * The one typed fetch wrapper for the whole SPA. Relative base `/api/v1`
 * (same-origin in prod, Vite-proxied in dev), credentials included so the
 * httpOnly session cookies ride along. No Supabase or design SDK in the browser.
 *
 * On a 401 from a non-auth route it transparently calls /auth/refresh once
 * (deduped across concurrent calls) and replays the original request.
 */
const BASE = '/api/v1';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, body: ApiErrorBody) {
    super(body.error?.message ?? 'Request failed');
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error?.code ?? 'UNKNOWN';
    this.details = body.error?.details;
  }
}

const CSRF_COOKIE = 'sw_csrf';

function readCsrf(): string | undefined {
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return match?.split('=')[1];
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, unknown>;
  signal?: AbortSignal;
  /** Internal: prevents refresh recursion. */
  _isRetry?: boolean;
  /** Internal: opt out of the 401->refresh dance (used by auth routes). */
  _noRefresh?: boolean;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(BASE + path, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const v of value) url.searchParams.append(key, String(v));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + url.search;
}

let refreshInFlight: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  if (!refreshInFlight) {
    refreshInFlight = request<void>('/auth/refresh', {
      method: 'POST',
      _noRefresh: true,
    }).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = readCsrf();
    if (csrf) headers['x-csrf-token'] = csrf;
  }

  const res = await fetch(buildUrl(path, query), {
    method,
    credentials: 'include',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (res.status === 401 && !opts._isRetry && !opts._noRefresh) {
    try {
      await refreshSession();
      return request<T>(path, { ...opts, _isRetry: true });
    } catch {
      // fall through to the error below
    }
  }

  if (!res.ok) {
    let errBody: ApiErrorBody = { error: { code: 'UNKNOWN', message: res.statusText } };
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, errBody);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Multipart upload helper for admin image uploads (no Content-Type override). */
export async function uploadFile<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = readCsrf();
  if (csrf) headers['x-csrf-token'] = csrf;

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });

  if (!res.ok) {
    let errBody: ApiErrorBody = { error: { code: 'UNKNOWN', message: res.statusText } };
    try {
      errBody = (await res.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, errBody);
  }
  return (await res.json()) as T;
}

/**
 * Typed method-per-endpoint surface. Every call routes through `request`
 * (credentials included, transparent 401->refresh) or `uploadFile` (multipart).
 */
export const api = {
  // --- Catalog (public) ---
  listProducts: (query: ProductListQuery = {}) =>
    request<Paginated<ProductSummaryDTO>>('/products', { query: query as Record<string, unknown> }),
  featured: () => request<ProductSummaryDTO[]>('/products/featured'),
  product: (slug: string) => request<ProductDetailDTO>(`/products/${encodeURIComponent(slug)}`),
  categories: () => request<CategoryDTO[]>('/categories'),
  brands: () => request<BrandDTO[]>('/brands'),

  // --- Auth ---
  login: (email: string, password: string) =>
    request<ProfileDTO>('/auth/login', { method: 'POST', body: { email, password }, _noRefresh: true }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<ProfileDTO>('/auth/me'),

  // --- Admin: products ---
  adminProducts: (query: { q?: string; category?: string; published?: boolean; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AdminProductListItem>>('/admin/products', { query }),
  adminProduct: (id: string) => request<AdminProductDTO>(`/admin/products/${id}`),
  createProduct: (body: unknown) =>
    request<AdminProductDTO>('/admin/products', { method: 'POST', body }),
  updateProduct: (id: string, body: unknown) =>
    request<AdminProductDTO>(`/admin/products/${id}`, { method: 'PATCH', body }),
  deleteProduct: (id: string) => request<void>(`/admin/products/${id}`, { method: 'DELETE' }),

  // --- Admin: images ---
  uploadImage: (productId: string, form: FormData) =>
    uploadFile<ProductImageDTO>(`/admin/products/${productId}/images`, form),
  reorderImages: (productId: string, items: { id: string; sortOrder: number }[]) =>
    request<ProductImageDTO[]>(`/admin/products/${productId}/images/reorder`, { method: 'PATCH', body: { items } }),
  setPrimaryImage: (productId: string, imageId: string) =>
    request<ProductImageDTO[]>(`/admin/products/${productId}/images/${imageId}/primary`, { method: 'PATCH' }),
  deleteImage: (productId: string, imageId: string) =>
    request<void>(`/admin/products/${productId}/images/${imageId}`, { method: 'DELETE' }),

  // --- Admin: categories ---
  adminCategories: () => request<AdminCategoryDTO[]>('/admin/categories'),
  createCategory: (body: unknown) =>
    request<AdminCategoryDTO>('/admin/categories', { method: 'POST', body }),
  updateCategory: (id: string, body: unknown) =>
    request<AdminCategoryDTO>(`/admin/categories/${id}`, { method: 'PATCH', body }),
  deleteCategory: (id: string) => request<void>(`/admin/categories/${id}`, { method: 'DELETE' }),

  // --- Admin: brands ---
  adminBrands: () => request<AdminBrandDTO[]>('/admin/brands'),
  createBrand: (body: unknown) => request<AdminBrandDTO>('/admin/brands', { method: 'POST', body }),
  updateBrand: (id: string, body: unknown) =>
    request<AdminBrandDTO>(`/admin/brands/${id}`, { method: 'PATCH', body }),
  deleteBrand: (id: string) => request<void>(`/admin/brands/${id}`, { method: 'DELETE' }),

  // --- Admin: maintenance ---
  cleanupOrphans: () =>
    request<OrphanCleanupResult>('/admin/images/cleanup-orphans', { method: 'POST' }),
};
