# Architecture — Tools Jamaica (Phase 1)

E-commerce **catalog + admin back-office** for Tools Jamaica (tools, hardware &
supplies). This document is the source of truth for how the system is built and
why. Phase 1 ships a public product catalog and an authenticated admin CRUD;
cart, checkout, customer accounts, and payments are deliberately deferred behind
clean seams.

---

## 1. Guiding principles

1. **Express is the sole gateway.** One Railway service runs Express, which
   serves the built React SPA *and* the API under `/api/v1`. Same-origin,
   first-party httpOnly cookies. The browser never talks to Supabase directly and
   ships **no** `@supabase/supabase-js`.
2. **Stitch is the source of truth for design.** All visual design derives from
   the Stitch "Industrial Integrity" design system, distilled into a single
   token layer. Components consume tokens, never raw hex/px.
3. **Types don't drift.** One shared package (`@tools-jamaica/shared`) holds the
   canonical DTOs consumed by both web and api — from source, no build step.
4. **Server owns authority.** Pricing, publication state, and auth are resolved
   server-side only. The client is never trusted with a price or a token.
5. **Build the seam, not the feature.** Deferred capabilities (cart, customers,
   tiered pricing, payments) have documented extension points so they're additive
   later, not rewrites.

---

## 2. Monorepo layout

npm workspaces; TypeScript ESM (`"type": "module"`), `strict` end-to-end.

```
tools-jamaica/
├── apps/
│   ├── api/                         # Express backend (also serves the built SPA)
│   │   ├── src/
│   │   │   ├── index.ts             # listen + graceful shutdown
│   │   │   ├── app.ts               # middleware stack + SPA fallback
│   │   │   ├── routes.ts            # mounts module routers under /api/v1
│   │   │   ├── config/env.ts        # zod-validated env (fail-fast at boot)
│   │   │   ├── lib/                 # supabase, jwt, cookies, pricing, errors,
│   │   │   │                        #   storage, slug, logger, serveSpa
│   │   │   ├── middleware/          # auth, csrf, validate, rateLimit, errorHandler
│   │   │   ├── modules/
│   │   │   │   ├── catalog/         # public reads: products, categories, brands
│   │   │   │   ├── auth/            # admin login/logout/me/refresh
│   │   │   │   └── admin/           # role-gated CRUD + image upload
│   │   │   └── types/               # db row types, express augmentation
│   │   ├── supabase/
│   │   │   ├── migrations/          # 0001_init … 0010_homepage_content (run by hand)
│   │   │   └── seed.sql
│   │   └── test/                    # vitest + supertest (hermetic, mocked)
│   └── web/                         # React + Vite SPA
│       └── src/
│           ├── App.tsx              # route table
│           ├── pages/               # public pages + pages/admin/*
│           ├── components/          # shared UI (ui/*) + layout + ProductCard
│           ├── context/             # AuthContext (admin session)
│           ├── styles/tokens.css    # design tokens from Stitch
│           └── lib/                 # api client, useAsync, formatters
├── packages/
│   └── shared/                      # canonical DTO types (@tools-jamaica/shared)
├── Dockerfile                       # multi-stage single-service image
└── railway.json                     # Railway deploy config
```

**Separation rules** (keep web/api splittable): no cross-imports between
`apps/web` and `apps/api`; anything shared lives in `packages/shared`; the
SPA-serving block (`lib/serveSpa.ts`) is one isolated module; the API base URL is
a single relative constant (`/api/v1`).

### Shared types are erased at runtime

The api imports from `@tools-jamaica/shared` only via `import type`, so with
`verbatimModuleSyntax` every such import is stripped at compile time. The built
API therefore has **zero runtime dependency** on the shared package (verified:
no `@tools-jamaica/shared` specifier survives in `apps/api/dist`). Dev consumes
the types from source with no rebuild.

---

## 3. Request & data flow

```
Browser (React SPA, cookies)
        │  fetch  /api/v1/*   (credentials: 'include', relative base)
        ▼
Express  (helmet → compression → json → cookieParser → CSRF → routers)
        │  service-role (db) / anon (authAnon) clients
        ▼
Supabase (Postgres + RLS defense-in-depth, GoTrue auth, Storage)
```

- In production, Express serves the SPA and the API from the **same origin**, so
  cookies are first-party and no CORS is needed. In dev, Vite (`:5173`) proxies
  `/api` to Express (`:3000`), preserving first-party cookies.
- Handlers are thin: `routes.ts` wires middleware, `schema.ts` holds zod,
  `service.ts` holds logic, `mappers.ts` converts DB rows → DTOs.

---

## 4. Authentication (admin, cookie-proxied)

The browser never holds a token. Express owns the whole auth surface and keeps
the session in signed, httpOnly cookies.

- **Two server-side Supabase clients** (`lib/supabase.ts`): `db` (service-role,
  bypasses RLS, all data + GoTrue admin ops) and `authAnon` (anon key, drives
  GoTrue sign-in/refresh/sign-out as a normal user). Neither reaches the browser.
- **Cookies** (`lib/cookies.ts`): `sw_at` (access, ~1h) and `sw_rt` (refresh,
  30d) are httpOnly + signed; `sw_csrf` is readable for double-submit CSRF.
  `SameSite=Strict`, `Secure` in production.
- **Token verification** (`lib/jwt.ts`): verifies Supabase access tokens. **JWKS
  (asymmetric ES256/RS256) is the primary path**; HS256 with the legacy shared
  secret is a fallback. The branch is chosen per-token by its header `alg`, so it
  works before *and* after a project migrates to asymmetric signing keys — no
  code change. (This project already issues ES256 session tokens, so JWKS is the
  live path.)
- **Middleware** (`middleware/auth.ts`): `requireAuth` verifies the access token
  and, if it's expired/invalid, transparently refreshes and rotates the cookies
  before continuing; `requireRole('admin')` gates the admin API; `optionalAuth`
  exists for forward-compat (unused in Phase 1's public catalog).
- **Client auto-refresh** (`web/src/lib/api.ts`): on a 401 from a non-auth route,
  it calls `/auth/refresh` once (deduped) and replays the request.

### Endpoints (`/api/v1/auth`)

| Method | Path | Notes |
|---|---|---|
| POST | `/login` | GoTrue `signInWithPassword`; sets cookies; returns profile (no tokens). Rate-limited, CSRF-exempt. |
| POST | `/refresh` | Rotates the session from the refresh cookie. Rate-limited, CSRF-exempt. |
| POST | `/logout` | Clears cookies (CSRF-protected). |
| GET | `/me` | Current admin profile from the session cookie. |

**First admin:** sign the user up in Supabase Auth, then set that
`profiles.role = 'admin'`. No public signup route in Phase 1.

---

## 5. Data model (Postgres / Supabase)

All tables `public.*`, UUID PKs (`gen_random_uuid()`),
`created_at`/`updated_at timestamptz`. Money is `NUMERIC(12,2)` with a `currency`
column **constrained to `JMD`**. Migrations are plain SQL, run by hand in the
Supabase SQL Editor, in order.

- **`profiles`** — 1:1 with `auth.users` (PK = `auth.users.id`). `email`,
  `full_name`, `role` enum (`admin` | `customer`, default `customer`),
  `is_active`. Auto-created via an `on_auth_user_created` trigger.
- **`brands`** — `name`, `slug` (unique), `logo_url`, `sort_order`.
- **`categories`** — `slug` (unique), `label`, `image_url`, `sort_order`,
  `is_published`. A **table with an FK from products** (not a hard enum) so admins
  add categories without a migration.
- **`products`** — `slug` (unique), `name`, `brand_id` (FK, nullable),
  `category_id` (FK), descriptions, `price`, `currency`, `stock`, `sku` (unique),
  `featured`, `is_published`, `rating`/`review_count` (static display columns).
- **`product_images`** — `product_id` (FK cascade), `url`, `is_primary`,
  `alt_text`, `sort_order`. A partial unique index enforces **one primary per
  product**.
- **`product_specs`** / **`product_highlights`** — power the detail page.
- **`home_hero`** — the editable hero. A **singleton row** (`id boolean primary
  key check (id)`), not a key/value settings table: the hero has a fixed designed
  shape, so typed columns keep `not null` meaningful and give a compile-time DTO.
- **`home_tiles`** — `slot` (`promo` | `service` | `ticker`), title/body, `icon`,
  `image_url`, `href`, `sort_order`, `is_published`. One table for three
  homepage blocks that differ only in where they render. The two promo cards no
  longer borrow a category's photo.
- **`store_locations`** — branches, rendered by the Footer on every page and the
  homepage "Visit us" block. `address` is unique (idempotent seed) and never
  translated.
- `brands.is_featured` drives the homepage brand rail.

### Bilingual content (`_es` sibling columns)

Every admin-typed column has a nullable `<col>_es` sibling (`0009_i18n_content`).
NULL — **and blank, which is guarded at both ends** — means "not translated yet"
and falls back to English, so the storefront is never broken mid-translation.
Deliberately **not** translated: `brands.name` (proper nouns and trademarks, and
`slug` is the URL-facing filter facet), every `slug` (one canonical URL per
product), `store_locations.address`, and `order_items.product_name`, which always
snapshots English because orders are read through the English admin UI.

`products.search_vector` is one **mixed-config** generated column —
`to_tsvector('english', …)` over the English columns *and* `to_tsvector('spanish',
…)` over the `_es` ones. Both two-arg forms are IMMUTABLE and so legal in a
generated expression. One mixed vector rather than a second column is what makes
partial translation searchable: the RPC ORs in an English tsquery as a
lower-weighted fallback leg, so a Spanish shopper still finds products whose
`_es` fields are still NULL.

### RLS posture

RLS is enabled on **every** table with deny-by-default policies: the public roles
may read only *published* catalog rows (child rows gated by the parent's publish
flag); a user may read only their own profile; no writes for public roles. The
API uses the service-role key (bypasses RLS), so RLS is **defense-in-depth** if a
key ever leaks. Grants give `anon`/`authenticated` `SELECT`-only on catalog
tables.

### Storage

Public-read buckets `product-images`, `brand-logos` and `site-images` (hero,
tiles, location photos). Admin uploads go **through Express → Supabase Storage**
(service role); the API returns the public URL and persists it. Every helper in
`lib/storage.ts` takes the bucket **first, with no default** — a wrong bucket
would silently leave orphans, and these functions back a destructive sweep.

Deleting a product/image/brand/tile/location removes its Storage object, and an
admin **orphan-sweep** endpoint removes unreferenced objects (only within our own
buckets — `pathFromPublicUrl` returns null for anything else, so external seed
URLs are never touched). The sweep has three safety rails, all load-bearing:

1. A **registry** pairing each swept bucket with every column that references it.
2. **`site-images` is excluded** from that registry — its URLs span three tables,
   and one missed source is a deleted hero.
3. A **tripwire**: zero references against a non-empty bucket means the reference
   query broke, not that every object is unused — it logs and skips rather than
   emptying the bucket. The admin button always **dry-runs first** and confirms
   against a real file list.

---

## 6. API surface

Base path `/api/v1`. JSON in/out. Every input validated with zod. Error envelope
`{ error: { code, message, details? } }`. Pagination `{ items, total, page,
pageSize }`.

### Catalog (public, no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Filter/sort/paginate: `category[]`, `brand[]`, `minPrice`, `maxPrice`, `inStock`, `q`, `sort`, `page`, `pageSize`. Published only. |
| GET | `/products/featured` | Home featured rail. |
| GET | `/products/:slug` | Full detail incl. images, specs, highlights, related. Published only. |
| GET | `/categories` | Published categories with `image_url` + product counts. |
| GET | `/brands` | Brand list / filter facet. |
| GET | `/brands/featured` | Homepage brand rail (registered above any `:slug` route). |
| GET | `/home` | The whole editable homepage in **one** payload: hero, promos, services, ticker, featured brands, locations. |
| GET | `/locations` | Branches — separate and small, because the Footer renders on every page. |

Every public catalog route accepts **`?lang=en|es`** (`.catch('en')`, so an
unknown value degrades rather than 400-ing a storefront page). A query param, not
a custom header: `x-locale` is not CORS-safelisted (it would break the documented
`WEB_ORIGIN` dev path) and a header makes responses vary on an invisible
dimension. The **public DTO shapes are unchanged** — the API resolves the
language in the mappers, so no storefront component had to change.

### Admin (`requireRole('admin')`, CSRF on mutations)

| Method | Path | Notes |
|---|---|---|
| GET/POST/PATCH/DELETE | `/admin/products…` | Full CRUD incl. specs/highlights, `featured`, `is_published`, stock. |
| POST/PATCH/DELETE | `/admin/products/:id/images…` | Multipart upload; reorder; set-primary; delete (removes the Storage object). |
| GET/POST/PATCH/DELETE | `/admin/categories…` | Category CRUD (delete blocked with 409 if products reference it). |
| GET/POST/PATCH/DELETE | `/admin/brands…` | Brand CRUD. |
| GET/PATCH/POST | `/admin/home…` | Hero (singleton upsert) + hero image upload. |
| GET/POST/PATCH/DELETE | `/admin/home/tiles…` | Tile CRUD + per-tile image upload. |
| GET/POST/PATCH/DELETE | `/admin/locations…` | Store-location CRUD + photo upload. |
| POST | `/admin/brands/:id/logo` | Brand logo upload (replaces + deletes the old object). |
| POST | `/admin/images/cleanup-orphans` | Sweep unreferenced Storage objects. `?dryRun=true` resolves the list without deleting. |

**Admin-only fields** (`is_published`, `sort_order`, ids, timestamps) are stripped
from the **public** DTOs and only exposed on the **admin** DTOs — as are the raw
`*Es` fields. Admin DTOs are **always English**, enforced structurally: `locale`
is a trailing, defaulted parameter on every mapper, so "admin gets English" means
simply not passing an argument. An ambient/`AsyncLocalStorage` locale would flow
into the admin DTOs and the product editor would then overwrite the English
columns with Spanish text. Do not "simplify" this into a global.

---

## 7. Front-end & design system

- **Stitch → tokens.** The "Industrial Integrity" palette/type/spacing/radii/
  shadows live in `web/src/styles/tokens.css` (CSS variables) and map into
  `tailwind.config.js`. Components use semantic utilities (`bg-primary`,
  `text-ink`, `rounded-card`, `shadow-pop`, `font-display`) — a palette change is
  a one-file edit. Drill Navy primary, Safety Orange accent, Montserrat display +
  Inter body.
- **Shared primitives** (`components/ui/*`), matching the SolarWorld conventions:
  a fixed-positioned `Select` (never native `<select>`), a `ConfirmDialog` for
  destructive actions (never `window.confirm`), a `Loader` spinner, and
  `ImageWithFallback` (broken URLs degrade to a placeholder + skeleton).
- **Data layer** (`lib/api.ts`): one typed fetch wrapper, relative base
  `/api/v1`, `credentials: 'include'`, `ApiError` type, transparent
  401→refresh→retry, a multipart `uploadFile` helper, and a method per endpoint.
  `useAsync` is the standard data-fetch hook.
- **Bilingual UI, hand-rolled** (`web/src/i18n/*`). For a two-locale,
  two-plural-form, no-RTL problem, `i18next` + `react-i18next` is ~40 kB gzipped
  and a plugin architecture we'd use none of — and the one thing a library buys,
  compile-time key safety, is free here: `en.ts` is a flat `as const` map of
  dotted keys, `TranslationKey = keyof typeof en`, and `es.ts` is typed as
  `Dictionary`, so a missing key is a compile error and an extra one an
  excess-property error. `t(key, vars?)` is a dictionary lookup plus a `{name}`
  regex replace.
  - **Detection:** `localStorage['tj_locale']` → first `navigator.language`
    starting with `es` → English. `main.tsx` calls `setApiLocale(...)` **before**
    `createRoot().render(...)`, because `HomePage` fires a catalog request on
    mount. `api.ts` never imports from `i18n/`; `main.tsx` imports both.
  - **Refetch on switch:** `<Routes key={locale}>` remounts the routed tree, so
    all 12+ catalog call sites refire. Adding `locale` to every `useAsync` dep
    array and missing one yields a half-translated page. The switcher is hidden
    on `/checkout`, where the remount would wipe a half-typed address.
  - **`ui/*` primitives never import from `i18n/`.** They are shared with the
    admin back-office, which stays English by agreement, so they take
    English-defaulted label props (`viewAllLabel`, `labels`, `closeLabel`) and
    the *public* callers pass `t(...)`.
  - Admin **chrome** stays English; admin **forms** get side-by-side en/es
    inputs via `components/admin/BilingualField.tsx`, and the product/category
    lists carry a "No ES" badge so untranslated rows are findable.
- **Pages.** Public: Home (hero, trust bar, departments, featured rail, CTA),
  Shop (URL-synced filters/search/sort + pagination), Product detail (gallery,
  specs, highlights, related). Admin (utilitarian, same tokens): login, products
  list, product editor + image manager, categories, brands — gated by
  `AuthContext` + `AdminLayout`, plus **Homepage** (hero + the three tile slots)
  and **Locations**.

The homepage is **admin-editable**: hero, promo cards, trust tiles, ticker,
featured brands and branches all come from `GET /home`. Nothing on it is
hardcoded copy any more except its own section chrome, which is a translation
key.

Only the Stitch **Home** screen is fully designed; Shop, Product detail, and the
admin pages are built in the same design language.

---

## 8. Cross-cutting concerns

- **Validation** — every mutating endpoint validates body/params/query with zod;
  types are inferred from the schemas.
- **Errors** — handlers throw typed `AppError`s; one `errorHandler` normalizes to
  the JSON envelope (incl. Zod → 400 and malformed-JSON → 400). `ah()` wraps async
  handlers.
- **Security** — helmet, signed httpOnly cookies, double-submit CSRF on non-GET,
  auth rate limiting, `trust proxy` for correct IPs/secure cookies behind Railway,
  service-role key never leaves the server.
- **Pricing authority** — a single server helper `resolvePrice(product, user)`;
  the client price is never trusted. Phase 1 returns the public price; this is the
  seam for tiered/installer pricing.
- **Config** — the full env is zod-validated once at boot (`config/env.ts`); the
  server refuses to start if misconfigured.
- **Logging** — `pino` + `pino-http` (pretty in dev, JSON in prod).

### Environment (`apps/api/.env`)

```
PORT=3000
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # server-only, never shipped to the client
SUPABASE_ANON_KEY=              # server-only; GoTrue auth calls
SUPABASE_JWT_SECRET=            # HS256 fallback; JWKS is the live path
COOKIE_SECRET=                  # signs the session cookies
APP_BASE_URL=https://<domain>   # canonical public origin (prod)
# WEB_ORIGIN=http://localhost:5173   # dev-only CORS when running Vite separately
```

---

## 9. Build, test & deployment

- **Root scripts:** `dev` (api + web concurrently), `build` (web then api),
  `start` (`node apps/api/dist/index.js`), `typecheck`, `lint`, `test`.
- **Serve order** (`app.ts`): pino-http → helmet → compression → (dev CORS) →
  json → cookieParser → CSRF → `/api/v1/*` routers → `/health` → `/api` 404 →
  `express.static(apps/web/dist)` → SPA fallback (non-API GET → `index.html`),
  registered **after** the API routes.
- **Tests:** Vitest + supertest in `apps/api`, hermetic (Supabase and JWKS are
  mocked at the module boundary), covering app wiring, catalog reads, auth, and
  admin role-gating.
- **Deploy:** a multi-stage `Dockerfile` at the repo root builds web + api on
  `node:24-alpine`, prunes dev deps, and runs `node apps/api/dist/index.js` as an
  unprivileged user. `railway.json` uses the Dockerfile builder with a `/health`
  healthcheck and restart-on-failure. Express binds `0.0.0.0:$PORT`; set the §8
  env vars (and `APP_BASE_URL` to the real domain) in Railway.

---

## 10. Deferred — seams, not features

Documented extension points so these are additive later, not refactors:

- **Cart & checkout** — no UI/tables yet; catalog DTOs already carry everything a
  cart line would snapshot (price, currency, sku, name, primary image).
- **Customer accounts** — auth is cookie-first and role-aware (`profiles.role`);
  adding customer signup is a new route + role, not a rewrite.
- **Tiered / installer (B2B) pricing** — resolved server-side through
  `resolvePrice(product, user)`; Phase 1 returns the public price.
- **Payments** — no provider/keys; reintroduce a `PaymentProvider` seam with
  cart/checkout.
- **AI product assistant** — out of scope; a future isolated module with
  read-only tool-use over the catalog service.

Explicitly out of scope now: guest checkout, review submission, email flows
beyond admin auth. (Rating/review columns exist as static display fields.)
```
