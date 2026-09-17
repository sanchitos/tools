import type {
  AdminBrandDTO,
  AdminCategoryDTO,
  AdminOrderListItem,
  AdminProductDTO,
  AdminProductListItem,
  AdminUserListItem,
  ApiErrorBody,
  BrandDTO,
  CategoryDTO,
  CreateOrderRequest,
  OrderDTO,
  OrderStatus,
  OrphanCleanupResult,
  Paginated,
  ProductDetailDTO,
  ProductImageDTO,
  ProductListQuery,
  ProductSummaryDTO,
  ProfileDTO,
  SignupResponse,
  Role,
  Locale,
  AdminHomeContentDTO,
  AdminHomeTileDTO,
  AdminStoreLocationDTO,
  HomeContentDTO,
  StoreLocationDTO,
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

/**
 * Language for every catalog read, injected once in buildUrl() rather than
 * threaded through ~20 api methods.
 *
 * Set from main.tsx BEFORE the first render — HomePage fires api.categories()
 * on mount, so the client must already know the locale by then. This module
 * deliberately does NOT import from i18n/ (main.tsx imports both), so the
 * dependency stays one-directional.
 */
let currentLocale: Locale = 'en';

export function setApiLocale(locale: Locale): void {
  currentLocale = locale;
}

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
  // Only for non-English, so every English URL stays byte-identical to before:
  // no cache churn, no test churn. Harmless on admin routes — their zod schemas
  // don't declare `lang` and z.object().parse() strips unknown keys.
  if (currentLocale !== 'en') url.searchParams.set('lang', currentLocale);
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
export async function uploadFile<T>(path: string, form: FormData, isRetry = false): Promise<T> {
  const headers: Record<string, string> = {};
  const csrf = readCsrf();
  if (csrf) headers['x-csrf-token'] = csrf;

  const res = await fetch(buildUrl(path), {
    method: 'POST',
    credentials: 'include',
    headers,
    body: form,
  });

  // Same 401 -> refresh -> replay as request(): without it an access token that
  // aged out mid-edit makes every upload fail with a bare 401 while every other
  // admin call silently self-heals. A FormData can be re-sent as-is.
  if (res.status === 401 && !isRetry) {
    try {
      await refreshSession();
      return uploadFile<T>(path, form, true);
    } catch {
      // fall through to the error below
    }
  }

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
  featuredBrands: () => request<BrandDTO[]>('/brands/featured'),
  /** One payload for the whole homepage — see catalog/homeService.ts. */
  home: () => request<HomeContentDTO>('/home'),
  /** Separate and small: the Footer renders on every page. */
  locations: () => request<StoreLocationDTO[]>('/locations'),

  // --- Orders (guest checkout — public, no auth) ---
  // No CSRF header needed: /api/v1/orders is exempt (see apps/api/src/app.ts) —
  // a guest shopper never has the sw_csrf cookie in the first place.
  createOrder: (body: CreateOrderRequest) =>
    request<OrderDTO>('/orders', { method: 'POST', body }),

  // --- Auth ---
  // `_noRefresh` on every unauthenticated route below: a 401 from these means
  // "those credentials/that token are wrong", never "the access token aged
  // out", so the refresh-and-replay dance would only add a pointless round trip.
  login: (email: string, password: string) =>
    request<ProfileDTO>('/auth/login', { method: 'POST', body: { email, password }, _noRefresh: true }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  me: () => request<ProfileDTO>('/auth/me'),

  /** 202 — creates an unconfirmed account and emails a link. Does NOT sign you in. */
  signup: (body: { email: string; password: string; fullName?: string }) =>
    request<SignupResponse>('/auth/signup', { method: 'POST', body, _noRefresh: true }),
  /** Exchanges the emailed token for session cookies; returns the profile. */
  confirmSignup: (token: string, type: 'signup' | 'magiclink' = 'signup') =>
    request<ProfileDTO>('/auth/confirm', { method: 'POST', body: { token, type }, _noRefresh: true }),
  /** Always resolves (the server answers 204 regardless) — never leaks whether the address exists. */
  resendConfirmation: (email: string) =>
    request<void>('/auth/resend-confirmation', { method: 'POST', body: { email }, _noRefresh: true }),

  // --- Account (the signed-in shopper's own data) ---
  myOrders: () => request<OrderDTO[]>('/account/orders'),

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
  /** Serves subcategories too — they are rows in the same table. */
  uploadCategoryImage: (id: string, form: FormData) =>
    uploadFile<AdminCategoryDTO>(`/admin/categories/${id}/image`, form),

  // --- Admin: brands ---
  adminBrands: () => request<AdminBrandDTO[]>('/admin/brands'),
  createBrand: (body: unknown) => request<AdminBrandDTO>('/admin/brands', { method: 'POST', body }),
  updateBrand: (id: string, body: unknown) =>
    request<AdminBrandDTO>(`/admin/brands/${id}`, { method: 'PATCH', body }),
  deleteBrand: (id: string) => request<void>(`/admin/brands/${id}`, { method: 'DELETE' }),
  uploadBrandLogo: (id: string, form: FormData) =>
    uploadFile<AdminBrandDTO>(`/admin/brands/${id}/logo`, form),

  // --- Admin: homepage ---
  adminHome: () => request<AdminHomeContentDTO>('/admin/home'),
  updateHero: (body: unknown) =>
    request<AdminHomeContentDTO['hero']>('/admin/home/hero', { method: 'PATCH', body }),
  uploadHeroImage: (form: FormData) =>
    uploadFile<AdminHomeContentDTO['hero']>('/admin/home/hero/image', form),
  createTile: (body: unknown) =>
    request<AdminHomeTileDTO>('/admin/home/tiles', { method: 'POST', body }),
  updateTile: (id: string, body: unknown) =>
    request<AdminHomeTileDTO>(`/admin/home/tiles/${id}`, { method: 'PATCH', body }),
  deleteTile: (id: string) => request<void>(`/admin/home/tiles/${id}`, { method: 'DELETE' }),
  uploadTileImage: (id: string, form: FormData) =>
    uploadFile<AdminHomeTileDTO>(`/admin/home/tiles/${id}/image`, form),

  // --- Admin: locations ---
  adminLocations: () => request<AdminStoreLocationDTO[]>('/admin/locations'),
  createLocation: (body: unknown) =>
    request<AdminStoreLocationDTO>('/admin/locations', { method: 'POST', body }),
  updateLocation: (id: string, body: unknown) =>
    request<AdminStoreLocationDTO>(`/admin/locations/${id}`, { method: 'PATCH', body }),
  deleteLocation: (id: string) => request<void>(`/admin/locations/${id}`, { method: 'DELETE' }),
  uploadLocationImage: (id: string, form: FormData) =>
    uploadFile<AdminStoreLocationDTO>(`/admin/locations/${id}/image`, form),

  // --- Admin: maintenance ---
  /** `dryRun` resolves the orphan list without deleting — always scan first. */
  cleanupOrphans: (dryRun = false) =>
    request<OrphanCleanupResult>('/admin/images/cleanup-orphans', {
      method: 'POST',
      query: dryRun ? { dryRun: 'true' } : undefined,
    }),

  // --- Admin: users ---
  adminUsers: (query: { q?: string; role?: Role; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AdminUserListItem>>('/admin/users', { query }),
  createUser: (body: { email: string; password: string; fullName?: string; role: Role }) =>
    request<AdminUserListItem>('/admin/users', { method: 'POST', body }),
  setUserActive: (id: string, isActive: boolean) =>
    request<AdminUserListItem>(`/admin/users/${id}`, { method: 'PATCH', body: { isActive } }),

  // --- Admin: orders ---
  adminOrders: (query: { status?: OrderStatus; q?: string; page?: number; pageSize?: number } = {}) =>
    request<Paginated<AdminOrderListItem>>('/admin/orders', { query }),
  adminOrder: (id: string) => request<OrderDTO>(`/admin/orders/${id}`),
  updateOrderStatus: (id: string, status: OrderStatus) =>
    request<OrderDTO>(`/admin/orders/${id}`, { method: 'PATCH', body: { status } }),
};
