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
│   │   │   │                        #   storage, slug, logger, email, serveSpa
│   │   │   ├── middleware/          # auth, csrf, validate, rateLimit, errorHandler
│   │   │   ├── modules/
│   │   │   │   ├── catalog/         # public reads: products, categories, brands
│   │   │   │   ├── auth/            # login/logout/me/refresh + signup/confirm
│   │   │   │   ├── account/         # the signed-in shopper's own data
│   │   │   │   └── admin/           # role-gated CRUD + image upload + users
│   │   │   └── types/               # db row types, express augmentation
│   │   ├── supabase/
│   │   │   ├── migrations/          # 0001_init … 0013_category_images (run by hand)
│   │   │   └── seed.sql
│   │   └── test/                    # vitest + supertest (hermetic, mocked)
│   └── web/                         # React + Vite SPA
│       └── src/
│           ├── App.tsx              # route table
│           ├── pages/               # public pages + pages/admin/*
│           ├── components/          # shared UI (ui/*) + layout + ProductCard
│           ├── context/             # AuthContext (admin + customer session)
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

## 4. Authentication (cookie-proxied)

The browser never holds a token. Express owns the whole auth surface and keeps
the session in signed, httpOnly cookies. One session mechanism serves both
audiences — `profiles.role` (`admin` | `customer`) is the only thing that
separates an admin from a shopper.

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
  populates `req.user` without ever blocking, and backs `POST /orders` so a
  signed-in shopper's order is stamped with their id while guest checkout is
  unchanged. Both re-read the profile on every request, so deactivating an
  account takes effect on that person's very next call — no token revocation.
- **Client auto-refresh** (`web/src/lib/api.ts`): on a 401 from a non-auth route,
  it calls `/auth/refresh` once (deduped) and replays the request.

### Endpoints (`/api/v1/auth`)

| Method | Path | Notes |
|---|---|---|
| POST | `/login` | GoTrue `signInWithPassword`; sets cookies; returns profile (no tokens). Rate-limited, CSRF-exempt. |
| POST | `/refresh` | Rotates the session from the refresh cookie. Rate-limited, CSRF-exempt. |
| POST | `/logout` | Clears cookies (CSRF-protected). |
| GET | `/me` | Current profile from the session cookie. |
| POST | `/signup` | Public self-registration (always `customer`). Creates an **unconfirmed** account, emails the link, returns **202** and **no cookies**. Rate-limited, CSRF-exempt. |
| POST | `/confirm` | Verifies the emailed token and sets the session. Rate-limited, CSRF-exempt. |
| POST | `/resend-confirmation` | Re-issues a link. **Always 204**, whatever happened. Rate-limited, CSRF-exempt. |

The three signup routes are CSRF-exempt because a visitor who has never logged
in has no `sw_csrf` cookie to double-submit; `signupRateLimit` (5/hour) is their
real control. They are listed **individually** in `app.ts`'s `CSRF_EXEMPT` —
that list is matched with `startsWith`, so collapsing them to `/api/v1/auth`
would silently exempt `/logout` too.

### Signup & email confirmation

We send the confirmation email **ourselves**, through the Resend REST API
(`lib/email.ts`, no new dependency — Node 24's `fetch`), rather than through
Supabase's SMTP. `db.auth.admin.generateLink()` creates the user and returns the
token *without sending anything*, which keeps the template in this repo, the
only mail config in `apps/api/.env`, and guarantees no competing Supabase email
(we never call `authAnon.auth.signUp()`).

```
POST /auth/signup
  -> generateLink({ type:'signup', ... })  creates auth.users (unconfirmed)
                                           -> trigger creates profiles (customer)
  -> sendConfirmationEmail(to, `${APP_BASE_URL}/auth/confirm?token=...&type=signup`)
  -> 202 { status:'confirmation_sent', email }          <- no cookies

link -> SPA /auth/confirm -> POST /auth/confirm { token, type }
  -> authAnon.auth.verifyOtp({ token_hash, type }) -> session
  -> setSession(res, tokens) -> 200 ProfileDTO
```

The link points at the **SPA**, which POSTs the token to Express — so the
browser still never holds a token. With `RESEND_API_KEY` unset, `lib/email.ts`
logs the link to the API console instead of sending (and throws in production),
which is what makes the whole loop testable before a verified domain exists.

A **resend** is issued as `generateLink({ type: 'magiclink' })`: GoTrue refuses
to regenerate a `signup` link for a user that already exists, and verifying a
magiclink stamps `email_confirmed_at` just the same — hence `/confirm` accepting
both types. Supabase's **"Confirm email" provider setting must be ON**; it is
what makes `signInWithPassword` reject an unconfirmed user, which the API maps
to a `403 EMAIL_NOT_CONFIRMED` (not the misleading "invalid email or password")
so the SPA can offer a resend.

Duplicate signup answers **409**, which does leak that an address is registered.
That is a deliberate trade: a storefront that silently swallows a duplicate
signup generates support tickets, and the enumeration risk on a hardware
catalog is acceptable. `/resend-confirmation` makes the opposite call — it has
no UX cost to silence, so it always answers 204.

**First admin:** sign the user up in Supabase Auth, then set that
`profiles.role = 'admin'`. After that, admins are created from the back-office
**Users** page. There is no public route that can mint an admin: `signupSchema`
has no `role` field at all.

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
- **`orders`** — `user_id` (FK to `profiles`, **nullable**, `on delete set
  null`): NULL is a guest order, and deleting an account must never erase order
  history. Added by `0011_user_accounts`, which is the whole database side of
  customer accounts — `profiles` already carried the role enum, `is_active`, and
  the `on_auth_user_created` trigger.
- **`products`** — `slug` (unique), `name`, `brand_id` (FK, nullable),
  `category_id` (FK), descriptions, `price`, `currency`, `stock`, `sku` (unique),
  `featured`, `is_published`, `rating`/`review_count` (static display columns).
  Since `0012`, `category_id` is the **main** category and is always **top-level**
  — a product's subcategories are many-to-many tags, below.
- **`product_subcategories`** — the product↔subcategory join (`0012`).
  `primary key (product_id, category_id)`, `product_id` cascade, `category_id`
  **restrict**. Restrict is load-bearing: it is what makes deleting a
  subcategory that still has tagged products a 409 instead of silently untagging
  every one of them. Two invariants the DB *cannot* express (no subqueries in a
  `CHECK`) are enforced by `validateTaxonomy()` in the admin service, exactly as
  `0007` left hierarchy depth to `validateParentId()`: the main category is
  top-level, and every tag is a child **of that** category. That second rule is
  what keeps a department filter honest — a tagged product's main category is
  always the tag's parent, so `category_id` alone still answers "everything in
  this department".
- **`product_images`** — `product_id` (FK cascade), `url`, `is_primary`,
  `alt_text`, `sort_order`. A partial unique index enforces **one primary per
  product**.
- **`product_specs`** / **`product_highlights`** — power the detail page.
- **`home_hero`** — the editable hero. A **singleton row** (`id boolean primary
  key check (id)`), not a key/value settings table: the hero has a fixed designed
  shape, so typed columns keep `not null` meaningful and give a compile-time DTO.
  It is written with an **`update … where id`, never an upsert**, and that is not
  a style preference: PostgREST compiles `.upsert()` to `insert … on conflict do
  update`, and Postgres checks NOT NULL on the *proposed* tuple **before** it
  resolves the conflict — so any partial write omitting `headline` (NOT NULL, no
  default) raises `23502` even when the row already exists. That is exactly what
  made hero image replacement fail with a 500. Both `updateHero` and
  `setHeroImage` branch on existence instead.
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

Public-read buckets `product-images`, `brand-logos`, `site-images` (hero, tiles,
location photos) and `category-images` (`0013` — categories *and* subcategories,
which are rows in the same table, so one bucket and one endpoint cover both).
Admin uploads go **through Express → Supabase Storage** (service role); the API
returns the public URL and persists it. Every helper in `lib/storage.ts` takes
the bucket **first, with no default** — a wrong bucket would silently leave
orphans, and these functions back a destructive sweep.

Deleting a product/image/brand/tile/location removes its Storage object, and an
admin **orphan-sweep** endpoint removes unreferenced objects (only within our own
buckets — `pathFromPublicUrl` returns null for anything else, so external seed
URLs are never touched). The sweep has three safety rails, all load-bearing:

1. A **registry** (`SWEEPS`) pairing each swept bucket with every column that
   references it. All four buckets are now registered.
2. **`site-images` is the dangerous entry**, because it is the only bucket whose
   URLs span more than one table: `home_hero.image_url`, `home_tiles.image_url`
   *and* `store_locations.image_url`. Its reference source is therefore a
   deliberate union (`siteImageRefs()`), and that function's source list **is**
   the safety property — dropping one entry does not degrade the sweep, it
   deletes live site content (no `home_hero` entry ⇒ the next sweep removes the
   hero image). Any new table or column holding a site-images URL must be added
   there in the same commit. `test/orphans.test.ts` pins each of the three by
   asserting an image referenced by *only* that source survives a sweep, so
   removing one fails the suite rather than the site. The union deliberately
   does not swallow query errors: a failed source aborts the whole sweep, since
   sweeping with two of three reference sets is the exact accident it exists to
   prevent. `category-images` is the easy case by contrast, and that is
   precisely why it is its own bucket rather than a folder under `site-images`:
   `categories.image_url` is the single column that references it.
3. A **tripwire**: zero references against a non-empty bucket means the reference
   query broke, not that every object is unused — it logs and skips rather than
   emptying the bucket. The admin button always **dry-runs first** and confirms
   against a real file list.

The UI is one button, **"Clean up unused images"**, in the header of the admin
**Products** page. It scans (`?dryRun=true`) before it ever deletes and names the
actual paths in the confirmation, because the admin has never seen these files
and authorising a bare count is not consent. `?dryRun=true` is also the
read-only way to simply *inventory* orphans without removing anything.

---

## 6. API surface

Base path `/api/v1`. JSON in/out. Every input validated with zod. Error envelope
`{ error: { code, message, details? } }`. Pagination `{ items, total, page,
pageSize }`.

### Catalog (public, no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/products` | Filter/sort/paginate: `category[]`, `brand[]`, `minPrice`, `maxPrice`, `inStock`, `q`, `sort`, `page`, `pageSize`. Published only. A `category` slug matches a product's **main category or any of its subcategory tags** (`0012`), on both the plain and the search path. |
| GET | `/products/featured` | Home featured rail. |
| GET | `/products/:slug` | Full detail incl. images, specs, highlights, related. Published only. |
| GET | `/categories` | Published categories with `image_url` + product counts. |
| GET | `/brands` | Brand list / filter facet. |
| GET | `/brands/featured` | Homepage brand rail (registered above any `:slug` route). |
| GET | `/home` | The whole editable homepage in **one** payload: hero, promos, services, ticker, featured brands, locations. |
| GET | `/locations` | Branches — separate and small, because the Footer renders on every page. |

### Account (`requireAuth`, the caller's own data only)

| Method | Path | Notes |
|---|---|---|
| GET | `/account/orders` | The caller's orders, newest first, with line items. Scoped by `user_id` **from the session** — never a parameter. |

Its own module rather than a route on `ordersRouter`, because that router
carries a router-level `orderRateLimit` of 10/hour: right for *placing* an
order, wrong for reading a history page.

Every public catalog route accepts **`?lang=en|es`** (`.catch('en')`, so an
unknown value degrades rather than 400-ing a storefront page). A query param, not
a custom header: `x-locale` is not CORS-safelisted (it would break the documented
`WEB_ORIGIN` dev path) and a header makes responses vary on an invisible
dimension. The **public DTO shapes are unchanged** — the API resolves the
language in the mappers, so no storefront component had to change.

### Admin (`requireRole('admin')`, CSRF on mutations)

| Method | Path | Notes |
|---|---|---|
| GET/POST/PATCH/DELETE | `/admin/products…` | Full CRUD incl. specs/highlights, `subcategoryIds`, `featured`, `is_published`, stock. A non-top-level `categoryId`, or a subcategory outside it, is a 400. |
| POST/PATCH/DELETE | `/admin/products/:id/images…` | Multipart upload; reorder; set-primary; delete (removes the Storage object). |
| GET/POST/PATCH/DELETE | `/admin/categories…` | Category CRUD (delete blocked with 409 if products or subcategories reference it; also deletes the Storage image). |
| POST | `/admin/categories/:id/image` | Category **or subcategory** image upload (replaces + deletes the old object). |
| GET/POST/PATCH/DELETE | `/admin/brands…` | Brand CRUD. |
| GET/PATCH/POST | `/admin/home…` | Hero (singleton update) + hero image upload. The image endpoint 400s until the hero row exists, since creating it needs a `headline` it has no way to supply. |
| GET/POST/PATCH/DELETE | `/admin/home/tiles…` | Tile CRUD + per-tile image upload. |
| GET/POST/PATCH/DELETE | `/admin/locations…` | Store-location CRUD + photo upload. |
| GET/POST/PATCH | `/admin/users…` | Paginated list (`?q=` email/name, `?role=`), create (`customer` **or** `admin`), activate/deactivate. |
| POST | `/admin/brands/:id/logo` | Brand logo upload (replaces + deletes the old object). |
| POST | `/admin/images/cleanup-orphans` | Sweep unreferenced Storage objects. `?dryRun=true` resolves the list without deleting. |

Admin-created users are **pre-confirmed** (`email_confirm: true`) and no email
is sent — the admin types the password and hands it over out of band. The list
reads `profiles` only: `email_confirmed_at` lives on `auth.users`, and merging a
separately paginated `listUsers()` into this one isn't worth it, so confirmation
state is a deliberate omission. Role change, password reset and hard delete are
**not** here yet; deactivation already covers "stop this person now", and it
bites immediately because `requireAuth` re-reads the profile per request.
Self-deactivation is refused with a 409 rather than letting the last admin lock
themselves out.

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
- **The product editor's taxonomy controls** are a top-level-only `Select` for
  the main category plus an inline **checkbox group** for that category's
  subcategories — not a new `ui/` multi-select. `ui/*` is shared with the
  storefront and must stay i18n-free, there is one consumer, and the admin wants
  every subcategory of a department visible at once. Changing the main category
  clears the tags **in the change handler**, never in an effect keyed on
  `categoryId` — such an effect fires right after hydration sets it and would
  wipe the saved tags of every product you open.
- **Pages.** Public: Home (hero, trust bar, departments, featured rail, CTA),
  Shop (URL-synced filters/search/sort + pagination), Product detail (gallery,
  specs, highlights, related), plus the account flow — **Signup**, **Login**,
  **/auth/confirm** and **Account** (order history), all under `PublicLayout`
  and all translated. Admin (utilitarian, same tokens): login, products
  list, product editor + image manager, categories, brands — gated by
  `AuthContext` + `AdminLayout`, plus **Homepage** (hero + the three tile slots),
  **Locations** and **Users**.
- **`AdminLayout` gates on the role, not just on a session.** Until customers
  could log in, any session there was an admin session; now a signed-in shopper
  would otherwise see the whole back-office chrome with every panel 403-ing, so
  a non-admin is redirected to `/account`. The header's single account
  affordance resolves three ways: `/admin` for an admin, `/account` when signed
  in, `/login` when not.
- **`/auth/confirm` fires its POST exactly once** (a `useRef` guard): the token
  is single-use, and StrictMode's double-invoked effect would otherwise show a
  failure for a token the first attempt had just consumed.

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
RESEND_API_KEY=                 # optional; unset => confirmation link is LOGGED, not sent
EMAIL_FROM=                     # e.g. "Tools Jamaica <no-reply@example.com>"
```

`APP_BASE_URL` is also the host of the emailed confirmation link, so in local
development it should point at the Vite dev server.

---

## 9. Build, test & deployment

- **Root scripts:** `dev` (api + web concurrently), `build` (web then api),
  `start` (`node apps/api/dist/index.js`), `typecheck`, `lint`, `test`.
- **Serve order** (`app.ts`): pino-http → helmet → compression → (dev CORS) →
  json → cookieParser → CSRF → `/api/v1/*` routers → `/health` → `/api` 404 →
  `express.static(apps/web/dist)` → SPA fallback (non-API GET → `index.html`),
  registered **after** the API routes.
- **Tests:** Vitest + supertest in `apps/api`, hermetic (Supabase, JWKS and
  `lib/email.ts` are mocked at the module boundary), covering app wiring,
  catalog reads, auth (login, signup, confirmation), the account surface,
  admin role-gating, and the orphan sweep (`lib/storage.ts`'s two Supabase-facing
  functions are stubbed while `pathFromPublicUrl` stays real, since URL→path
  resolution is the logic under test).
- **Deploy:** a multi-stage `Dockerfile` at the repo root builds web + api on
  `node:24-alpine`, prunes dev deps, and runs `node apps/api/dist/index.js` as an
  unprivileged user. `railway.json` uses the Dockerfile builder with a `/health`
  healthcheck and restart-on-failure. Express binds `0.0.0.0:$PORT`; set the §8
  env vars (and `APP_BASE_URL` to the real domain) in Railway.

---

## 10. Deferred — seams, not features

Documented extension points so these are additive later, not refactors:

- **Password reset / forgot password** — the remaining gap in the account flow.
  `/auth/resend-confirmation` is the shape it follows: a `generateLink({ type:
  'recovery' })` + `lib/email.ts` send, and a second SPA page that POSTs the
  token back. Also deferred: profile editing, social login, address book.
- **Cart & checkout** — no UI/tables yet; catalog DTOs already carry everything a
  cart line would snapshot (price, currency, sku, name, primary image).
- **Tiered / installer (B2B) pricing** — resolved server-side through
  `resolvePrice(product, user)`; Phase 1 returns the public price.
- **Payments** — no provider/keys; reintroduce a `PaymentProvider` seam with
  cart/checkout.
- **AI product assistant** — out of scope; a future isolated module with
  read-only tool-use over the catalog service.

Explicitly out of scope now: review submission, and email flows beyond the
signup confirmation. (Rating/review columns exist as static display fields.)
```
