# {{CLIENT_NAME}} — Build Spec (Phase 1: Catalog + Admin)

> **Purpose.** Hand this document to Claude Code to build a new e-commerce site
> for {{CLIENT_NAME}} from scratch. It mirrors the proven architecture of the
> SolarWorld CR platform (Express-as-sole-gateway, Supabase, cookie-proxied auth,
> single Railway service) but is **scoped to Phase 1 only**: a public product
> catalog and an admin back-office to manage products and images. Cart, checkout,
> customer accounts, and payments are deliberately deferred behind clean seams.
>
> **Front-end design comes from a Stitch MCP** — see §8. Stitch is the *source of
> truth* for all visual design (layout, palette, typography, spacing, components).
> Claude must implement the UI to match what the Stitch MCP returns, not invent it.

---

## ▶ 0. FILL THESE IN BEFORE BUILDING

These values parameterize the whole spec. Replace every `{{TOKEN}}` occurrence.

| Token | Meaning | Example |
|---|---|---|
| `{{CLIENT_NAME}}` | Company / brand name | e.g. "Acme Tools CR" |
| `{{PRODUCT_DOMAIN}}` | What they sell (drives catalog fields) | e.g. "power tools & hardware" |
| `{{PKG_SCOPE}}` | npm workspace scope | e.g. `@acme` (packages: `@acme/web`, `@acme/api`, `@acme/shared`) |
| `{{ORDER_PREFIX}}` | Reserved for later order numbers | e.g. `ACM` → `ACM-2026-00001` |
| `{{APP_DOMAIN}}` | Production domain | e.g. `acme-production.up.railway.app` |
| `{{STITCH_MCP_NAME}}` | The configured Stitch MCP server name | e.g. `stitch` |
| `{{CATEGORY_EXAMPLES}}` | Seed categories for the domain | e.g. drills, saws, fasteners, safety |

**Currency / locale:** default USD, English UI (match SolarWorld). Change here if
the client differs: `{{CURRENCY}}` = `USD`, `{{LOCALE}}` = `en`.

**Brand identity note:** colors, typography, logo, and tone are expected to come
from the **Stitch designs** (§8). If the client also has a separate brand guide,
add it here and treat Stitch + the guide together as the design source of truth.

---

## 1. Scope

### In scope (Phase 1)
- **Public storefront (read-only browsing):** home/landing, shop/catalog list
  (search + filter + sort), product detail page.
- **Admin back-office (authenticated):** admin login, and full CRUD for
  **products**, **product images** (upload to Supabase Storage), **categories**,
  and **brands**. Publish/unpublish products.
- **One deployable service:** Express serves both the built SPA and the API under
  `/api/v1` on a single Railway service (same-origin, first-party cookies).

### Deferred — build the *seam*, not the feature
Leave clearly-marked, documented extension points so these are additive later, not
refactors:
- **Cart & checkout** (`orders`, `cart` modules) — do not build UI or tables now,
  but keep the catalog/DTO shapes compatible (a product has everything a cart line
  would snapshot).
- **Customer accounts** — the auth layer is built cookie-first and role-aware
  (`profiles.role`), so adding customer signup later is a new route + role, not a
  rewrite.
- **Pricing tiers / installer (B2B) pricing** — pricing is resolved **server-side
  only** via a single `resolvePrice(product, user)` helper. Phase 1 returns the
  public `price`; the helper is the seam for tiered pricing later.
- **Payments** — no provider, no keys. (Reintroduce the `PaymentProvider` seam
  with cart/checkout.)
- **AI product assistant** — out of scope; reintroduce as an isolated `assistant`
  module later (read-only tool-use over the catalog service).

### Explicitly out of scope now
Guest checkout, reviews/ratings submission, email flows beyond what admin auth
needs, i18n. (Reviews columns may exist as static display fields; no `reviews`
table needed yet.)

---

## 2. Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (ESM, `"type": "module"`), `strict: true`, end to end |
| Frontend | React + Vite + React Router + Tailwind CSS |
| Backend | Node.js (≥24.15.0) + Express |
| Database | PostgreSQL via Supabase (SQL migrations + RLS as defense-in-depth) |
| Storage | Supabase Storage (`product-images` bucket, public read) |
| Auth | Supabase GoTrue, wrapped in our own httpOnly-cookie session layer |
| Design | **Stitch MCP** — source of truth for all front-end design (§8) |
| Deployment | Single Docker image on Railway (Express serves API **and** SPA) |

Pin Node with `.nvmrc` (`24.15.0`) and `engines.node`. Dev deps: `typescript`,
`tsx`, `vitest` + `supertest`, `eslint`. Runtime deps (api): `express`,
`@supabase/supabase-js`, `zod`, `helmet`, `compression`, `cookie-parser`,
`pino` + `pino-http`, `express-rate-limit`. **No Supabase SDK ships to the
browser** — the web app talks only to Express.

---

## 3. Monorepo layout

npm workspaces; shared DTO types live in one package so web and api never drift.
Scaffold **only** the folders Phase 1 needs — do not create empty `cart`/`orders`
modules.

```
{{CLIENT_SLUG}}/
├── apps/
│   ├── api/                        # Express backend (also serves the built SPA)
│   │   ├── src/
│   │   │   ├── index.ts            # listen + graceful shutdown
│   │   │   ├── app.ts              # middleware stack + SPA fallback
│   │   │   ├── routes.ts           # mounts module routers under /api/v1
│   │   │   ├── config/env.ts       # zod-validated env (fail-fast at boot)
│   │   │   ├── lib/                # supabase, jwt, cookies, pricing, errors, storage
│   │   │   ├── middleware/         # auth, csrf, validate, rateLimit, errorHandler
│   │   │   ├── modules/
│   │   │   │   ├── catalog/        # public reads: products, categories, brands
│   │   │   │   ├── auth/           # admin login/logout/me (+ refresh)
│   │   │   │   └── admin/          # role-gated CRUD + image upload
│   │   │   └── types/              # db row types, express augmentation
│   │   └── supabase/
│   │       ├── migrations/         # 0001_init.sql, 0002_rls.sql, 0003_grants.sql
│   │       └── seed.sql
│   └── web/                        # React SPA
│       └── src/
│           ├── App.tsx             # route table
│           ├── pages/              # public pages + pages/admin/*
│           ├── components/         # shared UI (from Stitch design system)
│           ├── context/            # AuthContext (admin session)
│           ├── styles/             # design tokens from Stitch (§8)
│           └── lib/                # api client, hooks, formatters
└── packages/
    └── shared/                     # canonical DTO types ({{PKG_SCOPE}}/shared)
```

**Separation rules (keep web/api splittable):** no cross-imports between `apps/web`
and `apps/api`; anything shared lives in `packages/shared`; the SPA-serving block
in `app.ts` is one isolated module; the API base URL is a single config constant
(relative `/api/v1`).

---

## 4. Data model (Postgres / Supabase)

All tables `public.*`, UUID PKs (`gen_random_uuid()`), `created_at`/`updated_at
timestamptz`. Money is `NUMERIC(12,2)` with a `currency` column constrained to
`{{CURRENCY}}`. Schema is plain SQL migrations run in order.

> **Never run SQL against Supabase directly.** Write the next numbered `.sql` in
> `apps/api/supabase/migrations/` and let the user run it in the Supabase SQL
> Editor. Make column adds idempotent (`add column if not exists`).

### Identity (admin auth this phase; forward-compatible with customers later)
- **`profiles`** (1:1 with `auth.users`, PK = `auth.users.id`)
  - `email`, `full_name`, `role` enum `admin` (extensible to `customer` later,
    default `customer` once customers exist), `is_active bool default true`,
    timestamps. Auto-created via trigger on `auth.users` insert.

### Catalog
- **`brands`**: `name`, `slug` (unique), `logo_url` (nullable), `sort_order`.
- **`categories`**: `slug` (unique), `label`, `image_url` (nullable),
  `sort_order`, `is_published bool default true`.
  - Use a **`categories` table with a FK from products** (not a hard Postgres
    enum) so the admin can add categories for `{{PRODUCT_DOMAIN}}` without a
    migration. Seed with `{{CATEGORY_EXAMPLES}}`.
- **`products`**: `slug` (unique), `name`, `brand_id` (FK nullable),
  `category_id` (FK), `short_description`, `description`, `price`, `currency`,
  `stock int default 0`, `sku` (nullable, unique), `featured bool default false`,
  `is_published bool default true`, `rating numeric(2,1) default 0`,
  `review_count int default 0` *(static display columns for now)*, timestamps.
- **`product_images`**: `product_id` (FK, cascade delete), `url`,
  `is_primary bool`, `alt_text`, `sort_order`.
- **`product_specs`** *(recommended, cheap, powers detail pages)*: `product_id`,
  `label`, `value`, `sort_order`.
- **`product_highlights`** *(recommended)*: `product_id`, `text`, `sort_order`.

### RLS posture
Enable RLS on **every** table with deny-by-default policies (public can read
published catalog rows; everything else denied). The API uses the service-role
key and bypasses RLS, so this is defense-in-depth if a key ever leaks.

### Storage
- Bucket **`product-images`** (public read). Admin uploads go **through Express →
  Supabase Storage**; the API returns the public URL and persists it on
  `product_images`. Add a `brand-logos` bucket if brand logos are used.
- **Orphan-image cleanup:** deleting a product/image should remove its storage
  object(s); provide an admin action to sweep orphans (mirror SolarWorld's
  orphan-image cleanup).

---

## 5. Authentication (admin, cookie-proxied — no token in the browser)

Same locked posture as SolarWorld: **the browser never calls Supabase directly.**
Express owns the entire auth surface and keeps the session in signed, httpOnly
cookies. The web app ships **no `@supabase/supabase-js`**.

- **Two server-side Supabase clients** (`lib/supabase.ts`): `db` (service-role,
  bypasses RLS, all data + GoTrue admin ops — never reaches the browser) and
  `authAnon` (anon key, for GoTrue sign-in/refresh/sign-out as a normal user).
- **Cookies** (`lib/cookies.ts`): `sw_at` (access, ~1h) and `sw_rt` (refresh, 30d)
  are httpOnly + signed; `sw_csrf` is readable for double-submit CSRF. Refresh
  cookie scoped to `path: '/'`. `SameSite=Strict` (same-origin in prod).
- **Access-token verification** (`lib/jwt.ts`): verify Supabase JWTs against the
  project's JWKS (ES256/RS256, cached by `kid`), HS256 legacy secret as fallback.
- **Middleware** (`middleware/auth.ts`): `requireAuth` verifies the access token
  and transparently refreshes + rotates cookies if expired; `requireRole('admin')`
  gates the admin API. (`optionalAuth` exists for forward-compat but Phase 1's
  public catalog needs no auth since there are no pricing tiers yet.)
- **Client auto-refresh** (`apps/web/src/lib/api.ts`): on a 401 from a non-auth
  route, call `/auth/refresh` once (deduped) and replay the request.

### Auth endpoints (`/api/v1/auth`)
| Method | Path | Notes |
|---|---|---|
| POST | `/login` | Express → GoTrue `signInWithPassword`, sets cookies, returns profile (no tokens). |
| POST | `/logout` | Clears cookies. |
| POST | `/refresh` | Rotates the session via the refresh cookie. |
| GET | `/me` | Current admin profile from the session cookie. |

> **First admin:** create by signing up the user in Supabase, then set that
> `profiles.role = 'admin'` in Supabase Studio. No public signup route in Phase 1.
> (Password reset / customer signup are deferred with the customer-accounts seam.)

---

## 6. API surface

Base path `/api/v1`. JSON in/out. Validate every input with zod via a `validate`
middleware. Error envelope: `{ error: { code, message, details? } }`. Consistent
pagination `{ items, total, page, pageSize }`.

### Catalog (public, no auth)
| Method | Path | Notes |
|---|---|---|
| GET | `/products` | List + filter. Query: `category[]`, `brand[]`, `minPrice`, `maxPrice`, `inStock`, `q`, `sort` (`featured\|price-asc\|price-desc\|name`), `page`, `pageSize`. Powers the Shop page. Only `is_published` rows. |
| GET | `/products/:slug` | Full detail incl. images, specs, highlights, related. Published only. |
| GET | `/products/featured` | Home featured rail. |
| GET | `/categories` | Published categories with `image_url` + product counts. |
| GET | `/brands` | Brand list / filter facet. |

### Admin (`requireRole('admin')`, CSRF on mutations)
| Method | Path | Notes |
|---|---|---|
| GET/POST/PATCH/DELETE | `/admin/products…` | Full product CRUD, incl. specs/highlights, `featured`, `is_published`, stock. |
| POST/DELETE | `/admin/products/:id/images…` | Multipart upload to Supabase Storage; reorder; set primary; delete (removes storage object). |
| GET/POST/PATCH/DELETE | `/admin/categories…` | Category CRUD (slug, label, image, sort). |
| GET/POST/PATCH/DELETE | `/admin/brands…` | Brand CRUD (name, slug, logo). |
| POST | `/admin/images/cleanup-orphans` | Sweep unreferenced storage objects. |

> **Admin-only fields** (`is_published`, `sort_order`, internal notes) are stripped
> from the **public** DTO and only exposed on the **admin** DTOs — mirror
> SolarWorld's split in `modules/admin/service.ts`.

Handlers are thin: `routes.ts` wires middleware, `schema.ts` holds zod,
`service.ts` holds logic, `mappers.ts` converts rows → DTOs.

---

## 7. Cross-cutting

- **Validation:** every mutating endpoint validates body/params/query with zod;
  types inferred from schemas.
- **Errors:** handlers throw typed `AppError`s (`BadRequest`, `Unauthorized`,
  `Conflict`, `Internal`, …); one `errorHandler` normalizes to JSON. `ah()` wraps
  async handlers.
- **Security:** helmet, signed httpOnly cookies, double-submit CSRF on non-GET,
  rate limiting on auth, `trust proxy` for correct IPs/secure cookies behind
  Railway. Service-role key never leaves the server.
- **Pricing authority:** even with one price now, resolve it through a single
  server helper `resolvePrice(product, user)` and **never trust a client price** —
  this is the seam for tiered pricing later.
- **Config:** the full env is zod-validated once at boot (`config/env.ts`); the
  server refuses to start if misconfigured.
- **DTO flow:** add a field in `packages/shared`, then the module `mappers.ts` and
  the row type in `types/db.ts`. Shared is consumed from source (no rebuild).

### Environment variables (`apps/api/.env`)
```
PORT=4000
NODE_ENV=development
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # server-only, never shipped to client
SUPABASE_ANON_KEY=              # server-only; GoTrue auth calls
SUPABASE_JWT_SECRET=            # HS256 fallback; JWKS is the live path
COOKIE_SECRET=                  # signs the session cookies
APP_BASE_URL=https://{{APP_DOMAIN}}
# WEB_ORIGIN=http://localhost:5173   # dev-only CORS when running Vite separately
```

---

## 8. Front-end design via the Stitch MCP (source of truth)

**The Stitch MCP (`{{STITCH_MCP_NAME}}`) is the single source of truth for all
visual design.** Claude must not invent layouts, colors, typography, spacing, or
component styling — it pulls the design from the MCP and implements React +
Tailwind to match. This section is a *process*, because the exact tool names the
MCP exposes are discovered at runtime.

### 8.0 Prerequisite — the MCP must be connected
The Stitch MCP has to be authorized in the environment before Claude can call it
(`claude mcp` or `/mcp` in an interactive session). If it is **not** connected,
Claude must **stop and say so** rather than guessing a design. Do not fabricate a
palette or layout to "unblock."

### 8.1 Workflow (per screen)
1. **Discover.** Enumerate the tools the Stitch MCP exposes and list the available
   screens/designs. Confirm coverage against the screen list in §8.3.
2. **Fetch the design.** For each screen, pull its layout, component hierarchy,
   spacing, color roles, typography, and any exported assets/icons.
3. **Extract tokens first.** Before building pages, distill a **design-token layer**
   — palette (with semantic roles: bg, surface, text, primary, accent, border,
   states), type scale, spacing scale, radii, shadows, breakpoints — into **one**
   source: `tailwind.config` theme extensions + CSS variables in
   `src/styles/tokens.css`. Every component consumes tokens, never hard-coded
   hex/px. This is what keeps the whole app visually consistent.
4. **Build components to match.** Implement the shared UI primitives and page
   layouts from the Stitch spec. Reuse the SolarWorld component conventions
   (§8.4) rather than re-deriving interaction patterns.
5. **Verify parity.** Compare the running screen against the Stitch design
   (screenshot/side-by-side) and reconcile spacing/color/type until it matches.

### 8.2 Rules
- **Stitch defines "what it looks like"; Claude decides "how it's wired."** Data
  binding, routing, state, and API calls are Claude's job; visual decisions defer
  to Stitch.
- **Tokens over literals.** No raw hex or magic pixel values in components —
  everything routes through the token layer so a Stitch palette change is a
  one-file update.
- **If a screen or state isn't in Stitch, ask.** Empty states, error states,
  loading skeletons, and admin screens may not all exist in Stitch; flag the gap
  and confirm the intended look rather than inventing it.
- **Assets:** pull icons/illustrations/logos exported by Stitch into
  `src/assets/`; don't substitute arbitrary icon libraries unless Stitch uses one.

### 8.3 Screens to build (Phase 1)
**Public:** Home/landing (hero, featured rail, shop-by-category), Shop/catalog
list (search + filters + sort, URL-synced), Product detail (image gallery,
specs/highlights). **Admin:** login, dashboard shell + nav, products list, product
editor (fields + image upload/reorder/primary), categories manager, brands
manager. Confirm which of these the Stitch project covers; the admin screens in
particular may need design or may follow a utilitarian admin style — decide with
the user.

### 8.4 UI conventions (carry over from SolarWorld)
- **Dropdowns:** a shared `Select` component (fixed-positioned), never a native
  `<select>` (mispositions in device emulation / clips in scroll containers).
- **Confirmations:** a shared `ConfirmDialog` for all destructive actions, never
  `window.confirm`.
- **Loading:** a `Loader` spinner, not plain "Loading…" text.
- **Images:** render remote/product images through `ImageWithFallback` (broken
  URLs degrade to a placeholder + skeleton).
- **Responsive grids:** always set a base `grid-cols-1` (mobile track
  `minmax(0,1fr)`) to avoid content-driven horizontal overflow.
- **Accessibility:** keep the token contrast ratios from Stitch AA-compliant;
  label inputs; keyboard-navigable dropdowns/dialogs.

### 8.5 Client — API integration
`apps/web/src/lib/api.ts`: one typed `fetch` wrapper, relative base `/api/v1`,
`credentials: 'include'`, `ApiError` type, transparent 401→refresh→retry, a
multipart `uploadFile` helper (for admin image upload), and a method per endpoint.
`useAsync` is the standard data-fetch hook. **No Supabase or design SDK in the
browser.**

---

## 9. Build, test & deployment

- **Root scripts:** `dev` (api + web concurrently), `build` (`build -w apps/web`
  then `build -w apps/api`), `start` (`node apps/api/dist/index.js`), `typecheck`,
  `lint`, `test`.
- **Single-service serve order** (`app.ts`): helmet → compression → json →
  cookieParser → csrf → `/api/v1/*` routers → `/health` →
  `express.static(apps/web/dist)` → SPA fallback (non-API GET → `index.html`,
  registered **after** the API routes).
- **Tests:** Vitest + supertest in `apps/api` (catalog reads, admin auth, product
  CRUD). Requires Node ≥24.
- **Deploy:** multi-stage `Dockerfile` at repo root builds web + api on
  `node:24-alpine`; runtime runs `node apps/api/dist/index.js`. Railway config:
  Dockerfile builder, `/health` healthcheck, restart-on-failure, all §7 env vars
  set, `APP_BASE_URL` = `{{APP_DOMAIN}}`. Express binds `0.0.0.0:$PORT`.

---

## 10. Execution checklist (suggested order)

1. **Setup** — monorepo/workspaces, `apps/api` + `apps/web` + `packages/shared`
   scaffold, env validation, app + middleware wiring, `/health`, `.nvmrc`.
2. **Connect Stitch MCP** — verify `{{STITCH_MCP_NAME}}` is authorized; enumerate
   its tools; pull the design token layer (§8.3) into `tailwind.config` + tokens.
3. **Supabase schema** — migrations for §4 (profiles, brands, categories,
   products, product_images/specs/highlights), RLS + grants, `product-images`
   bucket. User runs the SQL.
4. **Catalog API** — products/categories/brands reads with filter/sort/pagination.
5. **Admin auth** — cookie-proxied login/logout/me/refresh + `requireRole('admin')`.
6. **Admin CRUD** — products (+ specs/highlights), image upload/reorder/primary,
   categories, brands, orphan cleanup.
7. **Front-end (Stitch-driven)** — shared components, then public pages (home,
   shop, product detail), then admin pages, each built to match Stitch and wired
   to the API. Verify visual parity.
8. **Cross-cutting** — finalize validation/errors/rate-limit/logging; tests.
9. **Deploy** — Dockerfile + Railway single service; managed Supabase.

---

## 11. Open items to confirm with the user

- The `{{TOKEN}}` values in §0 (client name, product domain, categories, domain,
  package scope, order prefix).
- **Stitch MCP:** its configured server name, that it's authorized in the target
  environment, and **which screens** it covers (esp. whether admin screens are
  designed in Stitch or should follow a utilitarian admin style).
- **Brand source:** confirm colors/type/logo come entirely from Stitch, or whether
  a separate brand guide should be layered in.
- **Categories model:** confirm a dynamic `categories` table (admin-managed) is
  preferred over a fixed enum (recommended, since the domain is open-ended).
- **Currency/locale** if not USD/English.
- Confirm **cart/customer accounts/payments** stay deferred (seams only) for Phase 1.
```
