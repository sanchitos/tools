# Tools Jamaica — Bilingual site, editable homepage, brand alignment

## Context

Five changes requested by the client, spanning a UI bug, a palette correction, brand
identity, a new admin-driven homepage CMS, and full English/Spanish support.

Two are small and self-contained (the `Select` scroll bug, the blue token). Three are
substantial: the logo replaces a text wordmark duplicated in four files; the homepage is
entirely hardcoded today, so making it editable means new tables, admin CRUD and an
upload path for images; and bilingual support touches every public page plus every table
that stores admin-typed copy.

The driving goals: the client must be able to change the homepage without a deploy, must
be able to enter both languages by hand (no machine translation), and the site's blue
must match the logo's blue.

**Decisions confirmed with the client:**
- Translation depth: UI chrome **and** all admin-entered content, via dual-language fields.
- Default language: detect from `navigator.language`, fall back to English; switcher persists.
- Editable homepage blocks: hero, trust/"In Stock" tiles, featured brands, **and locations**.
- Admin back-office chrome stays English; admin *forms* gain side-by-side en/es inputs.
- Brand logo upload: yes — generalize the storage helper (also unblocks hero upload).
- The logo is a static asset, not admin-editable.

---

## 1. (Bug) Category dropdown closes when you scroll

**File:** `apps/web/src/components/ui/Select.tsx`

The menu is portalled to `document.body` and positioned `fixed` from a `DOMRect` captured
once at open time (`Select.tsx:42-44`). Because that snapshot can never follow the trigger,
the component compensates by dismissing itself on any scroll:

```ts
const onScroll = () => setOpen(false);
window.addEventListener('scroll', onScroll, true);   // Select.tsx:56,58
```

`capture: true` means this fires for scrolls from **every** element in the document — and
`onScroll` does no target check at all, unlike the `close` handler directly above it which
does guard on `menuRef.contains(...)`. The menu is `max-h-64 overflow-auto` (`:127`), so
with a category list longer than ~6 rows the user scrolls *inside the menu* and the
capture listener closes it. That is the reported symptom. Page scroll and the
`overflow-x-hidden` `<main>` in `AdminLayout.tsx:50` close it too.

**Fix — reposition instead of dismiss:**

1. Extract the measurement into a `place()` callback that sets `rect` from
   `btnRef.current.getBoundingClientRect()`; call it from the existing `useLayoutEffect`.
2. Replace the `onScroll` handler with one that: returns early if
   `menuRef.current?.contains(e.target as Node)` (scrolling the menu's own list must do
   nothing), otherwise schedules `place()` on `requestAnimationFrame` (coalesce with a
   stored frame id, cancel on cleanup).
3. Keep `resize` → `place()` as well.
4. Close only when the trigger has actually left the viewport — after `place()`, if
   `rect.bottom < 0 || rect.top > window.innerHeight`, `setOpen(false)`.
5. While in the file, add the two adjacent wins the frozen-rect design also blocked:
   - **Flip up** when `rect.bottom + menuHeight > window.innerHeight` and there is more
     room above (currently a select near the viewport bottom renders off-screen).
   - **Scroll the active option into view** on arrow-key navigation
     (`menuRef.current?.children[activeIdx]?.scrollIntoView({ block: 'nearest' })`),
     which today moves the highlight out of sight past row ~6.

**Regression-test all four call sites**, two of which sit beside `overflow-x-auto` tables:
`ProductEditorPage.tsx:143` (Category) and `:146` (Brand), `AdminCategoriesPage.tsx:177`,
`AdminOrdersPage.tsx:71`, `AdminOrderDetailPage.tsx:62`.

**Also verify (do not fix blind):** `Field` in `ProductEditorPage.tsx:386` renders a
`<label>` wrapping the `Select`'s `<button>`. `<button>` is a labelable element, so label
activation can forward a synthetic click and double-toggle the menu. Browsers suppress
this when the click originates inside the labeled control, so it is probably dormant — but
confirm by clicking the *label text* itself. If it does double-toggle, change `Field`'s
outer element from `<label>` to `<div>` with a `<span>` for the text (noting that text
inputs then lose click-the-label-to-focus).

---

## 2. (Bug) Blue must be `#30489a`

The palette is fully tokenised — `tailwind.config.js` contains **zero hex literals**, every
colour is a `var(--color-*)`. So this is essentially a one-file edit.

**`apps/web/src/styles/tokens.css`** — current blues and their replacements:

| Line | Token | From | To |
|---|---|---|---|
| 18 | `--brand-blue` | `#282d53` | `#30489a` |
| 19 | `--brand-blue-deep` | `#1b1f3b` | `#24366f` |
| 30 | `--color-inverse-surface` | `#171a33` | `#1b2550` |
| 38 | `--color-primary` | `#282d53` | `#30489a` |
| 39 | `--color-primary-dark` | `#1b1f3b` | `#24366f` |
| 49 | `--color-highlight-fg` | `#1b1f3b` | `#24366f` |
| 58 | `--color-ring` | `#282d53` | `#30489a` |

`--color-primary-dark` is the hover/pressed state and `--color-inverse-surface` is the
dark footer/header ground; both are derived from the brand blue and must move with it or
the hover states invert oddly against the brighter new primary.

Leave the blue-tinted neutrals (`--color-background #f8f9ff`, `--color-surface-muted`,
`--color-surface-strong`, `--color-border`) alone — they read as warm-neutral greys, and
retinting them is a visual redesign, not a colour correction.

**`apps/web/index.html:6`** — `<meta name="theme-color" content="#282d53">` → `#30489a`.
This is the only blue hex outside `tokens.css` (the `bg-[#25D366]` in
`WhatsAppButton.tsx:17` is WhatsApp brand green and stays).

**Contrast check:** white on `#30489a` is ≈7.4:1 — passes AA for all text and AAA for
large. The yellow `#efe013` highlight on the new blue still passes. Spot-check the header,
footer, primary buttons and focus rings after the change.

**Housekeeping:** `apps/web/dist/` is committed and stale — its `index.html` still carries
the pre-recolor `#014b7a`. Rebuild it as part of this work or add `dist/` to
`.gitignore`; otherwise anything serving `dist/` directly ships a third, older palette.

---

## 3. (Feature) Company logo

No logo asset exists anywhere today — `apps/web/public/` contains only `hero.jpg`, there is
no favicon, and the brand mark is a two-`<span>` text wordmark duplicated in four files:

- `components/Header.tsx:84-87` — `TOOLS` / `JAMAICA`
- `components/Footer.tsx:18-21` — same, different colour
- `components/admin/AdminLayout.tsx:23-27` — `TOOLS` / `JA` + "Admin" tag
- `pages/admin/AdminLoginPage.tsx:36-37` — a fourth copy

**The asset is now in place** at `apps/web/public/logo.png` — 1728×1136 PNG, RGBA,
untagged (so treated as sRGB). Verified properties, all measured rather than assumed:

- **Genuinely transparent.** 60.2% of pixels are fully transparent and all four corners are
  `alpha=0`, with ~6.6k partially-transparent pixels doing antialiasing. So **no white chip
  is needed** — the lockup drops straight onto the dark blue header. The earlier caveat
  about a white rectangle does not apply.
- **45% of the canvas is empty padding.** Content bbox is `(111, 236) → (1633, 949)`:
  1522×713 at **2.13:1**. Left/top/right/bottom margins are 111/236/95/187px, and they are
  asymmetric, so the mark will sit visibly off-centre if used as-is.
- **Sampled brand colours** (dominant opaque pixels), against the current tokens:

  | | sampled from logo | token in `tokens.css` |
  |---|---|---|
  | red | `#d82528` | `#df2a2f` |
  | yellow | `#edd31e` | `#efe013` |
  | blue | `#304788` | `#30489a` (§2) |

  Every token is a slightly brightened version of its raw pixel — the palette was
  deliberately lifted for screen, not sampled literally. **`#30489a` is consistent with that
  existing treatment**, so §2 stands as specified; no change.

**Work:**

1. **Trim the asset.** Crop to the alpha bbox and commit the result as the web logo, keeping
   the original if wanted. Without this, 45% of every rendered `<img>` is empty space, the
   mark reads small, and the asymmetric margins push it off-centre. A one-line `PIL`/`sips`
   crop.
2. New `apps/web/src/components/Logo.tsx` — one component taking `variant: 'full' |
   'compact'` and a `className`, rendering an `<img>` with `alt="Tools Jamaica"` and explicit
   `width`/`height` to avoid layout shift. No background wrapper needed (see above).
3. Replace all four wordmarks with `<Logo>`. **Sizing:** at 2.13:1 the trimmed lockup is
   ~85px wide at 40px tall, ~137px at 64px. Header tier 2 is `h-16 lg:h-[74px]` and already
   carries a menu button, a ≤580px search field and a 3-item nav, so target ~40–48px tall
   (~85–102px wide) with breathing room — comparable to the text wordmark it replaces, not
   the full bar height.
4. `apps/web/index.html` — add `<link rel="icon">` and `apple-touch-icon`. **Decision: use
   the full lockup**, letterboxed on the brand blue in a square canvas (~6% padding),
   exported at 32, 180 (`apple-touch-icon`), 192 and 512px. Declare the sizes so browsers
   pick the largest they can use — the lockup reads well at 180px+ and degrades to a
   coloured smear at 32px, which the client has accepted in exchange for brand consistency
   across every icon surface. Generate all sizes from `logo.png` with PIL; do not hand-draw
   a separate mark.
5. While in `index.html`, add the `<meta name="description">` and Open Graph tags it
   currently lacks (`og:title`, `og:description`, `og:image` → the logo).

---

## 4. (Feature) English / Spanish

Land this **before** the homepage CMS: it establishes the `_es` column convention that the
new homepage tables then bake in from birth.

Nothing exists today — no i18n library in any of the four `package.json` files, no locale
files, all copy inline. `packages/shared/src/index.ts:35` has a vestigial
`export type Locale = 'en';` referenced by nothing. Widen it to `'en' | 'es'`.

### 4a. UI chrome — hand-rolled, no new dependency

`apps/web` has exactly four runtime deps (`@tools-jamaica/shared`, `react`, `react-dom`,
`react-router-dom`). `i18next` + `react-i18next` is ~40 kB gzipped and a plugin
architecture (backends, detectors, namespaces, ICU) for a two-locale, two-plural-form,
no-RTL, no-lazy-loading problem. And the main thing a library would buy — compile-time key
safety — is free hand-rolled, whereas with i18next it needs a `react-i18next.d.ts` module
augmentation plus `resources` type plumbing, which is more ceremony than the entire
hand-rolled implementation.

```
apps/web/src/i18n/
  locale.ts           Locale type, detection, persistence — framework-free
  en.ts               canonical dictionary (~215 keys)
  es.ts               typed as Dictionary — a missing key is a compile error
  LocaleContext.tsx   provider + useLocale() + useT()
  index.ts
apps/web/src/components/LocaleSwitcher.tsx
```

**Flat dotted keys, not nested**, so `keyof typeof en` is the exhaustive key union in one
step:

```ts
export const en = {
  'common.loading': 'Loading…',
  'home.hero.cta': 'Shop the catalog',
  'cart.itemCount_one': '{count} item',
  'cart.itemCount_other': '{count} items',
} as const;

export type TranslationKey = keyof typeof en;
export type Dictionary = Record<TranslationKey, string>;
```

`es.ts` typed as `Dictionary` makes a missing key an error and an extra key an
excess-property error. `t(key, vars?)` does `dict[key]` then a `{name}` regex replace —
about 15 lines.

- **Detection:** `localStorage.getItem('tj_locale')` (matching the existing `tj_cart_v1`
  convention, wrapped in try/catch like `CartContext`) ?? first `navigator.language`
  starting with `es` ?? `'en'`.
- **Ordering trap:** `HomePage` fires `api.categories()` on mount, so the API client must
  know the locale *before* React renders. Call `setApiLocale(detectInitialLocale())` in
  `main.tsx` **before** `createRoot().render(...)`. Keep the dependency one-directional —
  `api.ts` must not import from `i18n/`; `main.tsx` imports both.
- **Provider order** in `main.tsx`: `LocaleProvider` outermost, then `AuthProvider`, then
  `CartProvider`.
- The provider effect sets `document.documentElement.lang` and calls `persistLocale`.
- **Keys:** `<area>.<component>.<slot>` — `common.*` only for strings genuinely reused
  across two or more areas; otherwise one prefix per page (`nav.*`, `footer.*`, `home.*`,
  `shop.*`, `product.*`, `cart.*`, `checkout.*`, `order.*`, `notFound.*`). Plurals as
  `_one`/`_other` pairs. Never share a key across contexts just because the English happens
  to match — Spanish frequently diverges.

**Switcher placement:** a two-button `EN | ES` segmented control with `aria-pressed` — not
the `Select` primitive, which is overkill for two options. Desktop: the tier-3 promo bar in
`Header.tsx:131-149`, beside "Featured / In stock / Top brands". Mobile: inside
`DepartmentDrawer.tsx`, since that bar is `hidden … lg:flex`.

**Hide the switcher on `/checkout`.** See the remount note in 4c — switching language there
would wipe a half-typed delivery address.

#### The `components/ui/*` trap

Several primitives hold English copy: `Pagination` ("First page", "Previous page", …),
`Rail` ("View all →", "Scroll left"), `ConfirmDialog` (`confirmLabel = 'Confirm'`),
`Select` (`placeholder = 'Select…'`). **These are shared with the admin pages, which stay
English** — so if a primitive calls `t()` internally, the admin back-office silently turns
Spanish, violating the agreed scope.

Rule: **primitives never import from `i18n/`.** Extend their props with English-defaulted
label props (`viewAllLabel?: string`, `labels?: {...}`) and have the *public* callers pass
`t(...)`. Admin call sites then change zero lines, and `ui/*` stays a pure design-system
layer per ARCHITECTURE §7. This must land before page-by-page string extraction begins.

**Scale:** ~268 raw candidate strings → ~210–240 distinct keys after deduping. Heaviest:
`ShopPage` (37), `ProductDetailPage` (34), `CheckoutPage` (34), `HomePage` (27, dropping to
~10 once the hero/tiles/ticker come from the DB), `CartPage` (20), `ShopFilters` (18),
`Footer` (18, dropping once locations come from the DB).

**Not keys:** `lib/format.ts` `formatPrice` keeps `en-JM` currency formatting for both
locales — a Jamaican price is J$ regardless. `lib/contact.ts` `WHATSAPP_TEXT` *should*
become locale-aware.

### 4b. Content — `_es` sibling columns

All `_es` columns are **nullable `text`, no default**. NULL means "not translated yet" and
falls back to English, so the site is never broken mid-translation.

| Table | New columns |
|---|---|
| `products` | `name_es`, `short_description_es`, `description_es` |
| `categories` | `label_es` |
| `product_specs` | `label_es`, `value_es` |
| `product_highlights` | `text_es` |
| `brands` | **none** |

**Why brands get none:** brand names are proper nouns and registered trademarks (DeWalt,
Moen, Bosch). Beyond being wrong as content, `brands.slug` is the URL-facing filter facet
in `ShopPage` and `brands.name` is a trigram leg in the search RPC — a Spanish alias would
create a name/slug coherence gap for zero user benefit.

**Slugs are not translated** either: one canonical URL per product keeps
`getProductBySlug`, `ensureUniqueSlug` and the shop filter params single-valued. A Spanish
slug would need a redirect table and a second unique index.

### 4c. Locale resolution — server-side, public DTO shapes unchanged

The API resolves language in the mappers, so **public DTOs keep their current shape**
(`name: string`) and no storefront component changes. Only **admin** DTOs gain the
`nameEs` / `labelEs` / … fields, for editing. The alternative — ship both languages and
pick client-side — doubles every list payload, duplicates the fallback rule in the browser,
and bloats `AgentProductDTO`, which exists specifically to save tokens.

#### Transport: `?lang=es` query param, **not** a custom header

I initially proposed an `x-locale` header. That is wrong here, for two reasons verified
against this codebase:

1. **It breaks the documented dev path.** `apps/api/src/app.ts:47` sets
   `Access-Control-Allow-Headers: 'Content-Type, x-csrf-token'`. `x-locale` is not a
   CORS-safelisted header, so the moment anyone runs with `WEB_ORIGIN` set — the
   dev-without-the-Vite-proxy path documented in ARCHITECTURE §8 — every catalog request
   fails preflight.
2. **Cache correctness.** A custom header makes responses vary on an invisible dimension;
   any cache in front of Railway (or a future `Cache-Control` on catalog routes) serves the
   wrong language unless every response carries `Vary: x-locale`. Forgetting it is a
   silent, user-visible, hard-to-reproduce bug. A query param is cache-correct by
   construction.

The injection point is identical either way — you never touch the individual `api` methods:

```ts
// apps/web/src/lib/api.ts
let currentLocale: Locale = 'en';
export function setApiLocale(l: Locale): void { currentLocale = l; }

// inside buildUrl(), after the existing query loop:
if (currentLocale !== 'en') url.searchParams.set('lang', currentLocale);
```

Injecting **only for non-English** keeps every English URL byte-identical to today — zero
cache churn, zero test churn. It lands harmlessly on admin routes too: their zod schemas
don't declare `lang` and `z.object().parse()` strips unknown keys, so it's inert by
construction. `uploadFile()` needs no change.

#### Server side

New `apps/api/src/lib/locale.ts`:

```ts
export type Locale = 'en' | 'es';
export const DEFAULT_LOCALE: Locale = 'en';

/** Spanish when requested AND present — a blank string counts as absent. */
export function pick(locale: Locale, en: string, es: string | null | undefined): string {
  return locale === 'es' && es && es.trim() ? es : en;
}
export function pickNullable(
  locale: Locale, en: string | null, es: string | null | undefined,
): string | null {
  return locale === 'es' && es && es.trim() ? es : en;
}
```

The blank-string guard matters: if an admin types into `name_es` then clears it, a naive
`row.name_es ?? row.name` yields `''` — a blank product name on the storefront. Defend at
both ends: this guard, **and** a zod `.transform(v => v?.trim() || null)` on every `*Es`
field.

Query fragment in `catalog/schema.ts`:

```ts
export const langQuerySchema = z.object({
  lang: z.enum(['en', 'es']).catch('en').default('en'),
});
```

`.catch` so `?lang=fr` degrades to English rather than 400-ing a storefront page.

**Thread `locale` as an explicit trailing parameter — not `AsyncLocalStorage`.** Only four
service signatures change, because the biggest already carries a params object:

| Function | Change |
|---|---|
| `listProducts(params)` | none — add `lang` to `productListQuerySchema`, read `params.lang` |
| `getFeatured(limit = 8)` | → `getFeatured(locale, limit = 8)` |
| `getProductBySlug(slug)` | → `getProductBySlug(slug, locale)` |
| `listCategories()` | → `listCategories(locale)` |
| `listBrands()` | unchanged |

Mappers gain a trailing **defaulted** parameter: `toProductSummaryDTO(p, locale = 'en')`,
`toProductDetailDTO(p, related, locale = 'en')`, `toCategoryDTO(row, count?, locale = 'en')`.

The default is what makes this safe. `admin/mappers.ts` calls `toProductDetailDTO` and
`toProductSummaryDTO` directly, so an ambient locale would flow straight into admin DTOs —
and the product editor would then overwrite English fields with Spanish text. With a
defaulted trailing parameter, "admin gets English" is enforced by simply *not passing an
argument*, and the ARCHITECTURE §3 promise that mappers are pure row→DTO functions
survives. Four signatures beats one hidden global.

**Call site that will break the build:** `apps/api/src/modules/agent/service.ts` calls
`listProducts({...})` and `listCategories()`. Once `lang` is in the schema,
`ProductListParams` requires it — add `lang: 'en'` to the literal and `'en'` to the
`listCategories` call. (Plumbing a real locale through `agentSearchQuerySchema` for Spanish
WhatsApp answers is one line each side and worth doing, but it's optional and off the
critical path.)

#### Two snapshot decisions

- **`order_items.product_name` always snapshots English.** `orders/service.ts:77` copies
  `product.name` at order time. Orders are read through the English admin UI and the
  WhatsApp fulfillment flow; a Spanish snapshot makes `AdminOrderDetailPage` inconsistent
  row by row. Enforced for free by not passing a locale into the order path.
- **`CartContext` snapshots names into `localStorage`**, so a cart built in English keeps
  English line names after a switch. **Ignore this** — the client has confirmed it doesn't
  matter (the site isn't in production, and the server re-prices at checkout regardless).
  No re-hydration, no doc comment needed.

#### Refetch on switch: remount the routed tree

```tsx
const { locale } = useLocale();
return <Routes key={locale}> … </Routes>;
```

There are 12+ catalog call sites across `HomePage` (3), `ShopPage`, `ProductDetailPage`,
`Footer`, `DepartmentDrawer`, `ShopFilters`, plus the new home/locations calls. Adding
`locale` to every `useAsync` dep array and missing one produces a half-translated page that
nobody notices until a customer does. The remount is one line and correct by construction.

Casualties, audited: `ShopPage` filters are URL-synced (safe); cart lives in
`CartProvider` above `Routes` (safe); scroll position is lost (acceptable); **`CheckoutPage`
form fields are lost** — hence hiding the switcher on `/checkout`.

### 4d. Search must cover Spanish

`products.search_vector` is a **generated** column over English columns only
(`0005_search.sql:33-37`), so Spanish text is unsearchable. Generated columns can't be
altered in place.

**One mixed-config vector, not a second column.** Both `to_tsvector('english', …)` and
`to_tsvector('spanish', …)` are two-arg and therefore IMMUTABLE and legal in a generated
expression — `0005` already documents this at line 20. `pg_catalog.spanish` ships with
stock Postgres and is present on Supabase: no extension, no dictionary install.

```sql
alter table public.products drop column if exists search_vector;

alter table public.products
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(name_es, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(replace(sku, '-', ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(short_description_es, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(description_es, '')), 'C')
  ) stored;

create index if not exists idx_products_search_vector
  on public.products using gin (search_vector);
```

Four things that will bite if missed:

1. **`drop column` also drops the GIN index.** The `create index` above is mandatory, not
   defensive — omit it and every search silently degrades to a seq scan.
2. **The `_es` columns must be added before** the generated expression references them.
3. **`drop function` both signatures before `create`.** `create or replace` cannot change a
   signature — it creates an *overload*, and PostgREST then 300s on "could not choose the
   best candidate function". `0005_search.sql:64` already does the drop-then-create dance
   for exactly this reason; follow it, dropping both the 9-arg and any 10-arg form.
4. **Grants die with the function.** `0005:192-195` binds `revoke`/`grant execute` to the
   explicit argument list, so both must be re-issued against the **new 10-arg signature**
   or the API loses execute permission and every search 500s.

**RPC changes** — add `p_lang text default 'en'` and, inside:

- Config selection validated in SQL, so a hostile `p_lang` can never reach `to_tsvector` as
  an arbitrary regconfig:
  ```sql
  v_cfg regconfig := case when lower(coalesce(p_lang,'en')) like 'es%'
                          then 'spanish'::regconfig else 'english'::regconfig end;
  ```
- **A fallback tsquery.** This is the reason one mixed vector beats two columns: for a long
  time most rows will have NULL `name_es`, so a Spanish shopper querying a Spanish-only
  vector would find *nothing* for untranslated products. When the locale is Spanish, build
  an English tsquery too and OR it in as a separate, independently index-eligible union
  leg, scored at ~0.80× so a true Spanish match still outranks a cross-language one. Apply
  the existing `numnode() = 0 → NULL` guard to both.
- Spanish trigram legs (`p.name_es %> v_q`, `p.short_description_es %> v_q`), extended
  `word_similarity` scoring, extended prefix bonus on `name_es`, extended facet bonus on
  `c.label_es` — plus the three supporting GIN trgm indexes on `products.name_es`,
  `products.short_description_es`, `categories.label_es`.

**API side:** `catalog/service.ts` `searchProducts()` adds `p_lang: params.lang` to the
`db.rpc(...)` argument object. supabase-js passes named arguments, so a new defaulted
parameter is backward-compatible — but only because the old overload was dropped.

### 4e. Admin forms

One shared `apps/web/src/components/admin/BilingualField.tsx` — English input with the
Spanish one stacked beneath under small `EN`/`ES` chips, Spanish placeholder
`"(same as English)"`. ~50 lines, and the single biggest admin-UI lever here: reuse it in
`ProductEditorPage` (name, short description, description, each spec label/value, each
highlight), `AdminCategoriesPage` (label), `AdminHomePage` and `AdminLocationsPage`.

In the admin product and category lists, show a `Badge tone="warning"` "No ES" marker so
the client can find untranslated rows.

---

## 5. (Feature) Admin-editable homepage

### Why "In Stock" was impossible to find

It isn't a settable image. `HomePage.tsx:30` does `const [promoA, promoB] = categoryList`,
then `:103-106` renders the two hero-adjacent cards from those — so "In stock now" shows
**whatever photo is on the second top-level category**. Change a category's sort order and
the homepage image silently changes. Separately, the services/trust row (`:128-142`) is a
hardcoded `SERVICES` array rendering *icons only*, with no image at all. That borrowing is
the actual bug; giving both their own records is the fix.

Also worth knowing: `0008_category_taxonomy.sql` inserted the 16 real departments **without
`image_url`**, so most category images are currently NULL and render the
`ImageWithFallback` placeholder — including both promo tiles.

### Migration `0010_homepage_content.sql`

House style throughout: banner comment explaining why, `create table if not exists`,
`add column if not exists`, `drop policy if exists` before `create policy`, seeds via
`on conflict`.

```sql
-- Hero: exactly one row, structurally enforced.
create table if not exists public.home_hero (
  id         boolean primary key default true,
  constraint home_hero_singleton check (id),
  image_url  text,
  eyebrow    text, eyebrow_es   text,
  headline   text not null, headline_es text,
  subcopy    text, subcopy_es   text,
  cta_label  text, cta_label_es text,
  cta_href   text not null default '/shop',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Tiles: covers the hero promo cards, the trust row AND the ticker.
create table if not exists public.home_tiles (
  id           uuid primary key default gen_random_uuid(),
  slot         text not null check (slot in ('promo', 'service', 'ticker')),
  title        text not null, title_es text,
  body         text,          body_es  text,
  icon         text,          -- IconName from ui/Icon.tsx; used when image_url is null
  image_url    text,          -- site-images bucket
  href         text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_home_tiles_slot_sort
  on public.home_tiles (slot, sort_order) where is_published;

alter table public.brands add column if not exists is_featured boolean not null default false;
create index if not exists idx_brands_featured on public.brands (sort_order) where is_featured;

create table if not exists public.store_locations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null, name_es text,
  address      text not null unique,     -- NOT translated; unique so the seed is idempotent
  phone        text,
  hours        text,          hours_es text,
  map_url      text,
  image_url    text,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
```

Add `set_updated_at` triggers (the fn exists from `0001`) to all three tables.

**Three slots, one table.** `'promo'` = the two image cards beside the hero, which stop
borrowing category photos and get their own `image_url` + `href`. `'service'` = the
icon-only trust row. `'ticker'` = the marquee (`TICKER`, lines 8-13) — title only, and
including it costs nothing while removing the last hardcoded copy array from the homepage.

**No cross-column check** like `check (slot <> 'promo' or image_url is not null)` — it
would block creating a promo tile before its upload, since the admin flow is create row →
upload → PATCH `image_url`, same as products. `ImageWithFallback` already degrades
gracefully, per the CLAUDE.md convention.

`icon` is `text`, not an enum: it must track `IconName` in `ui/Icon.tsx`, which is a *web*
type the DB can't see. Validate it in the admin zod schema against a literal union mirrored
from `IconName`, and make the admin control a `Select` of known icons, not free text.

**Singleton row, not a key-value settings table.** Every table here is typed columns with a
hand-maintained row interface in `types/db.ts` and a pure `toXxxDTO(row)` mapper. A KV table
returns `{key, value}[]`, forces a runtime reduce, defeats `not null` (nothing guarantees
`headline` exists), and leaves no compile-time DTO. The hero has a fixed designed shape —
it's a Stitch screen, not user-extensible config. `id boolean primary key check (id)` also
makes the admin write a one-liner: `insert … on conflict (id) do update set …`, with no
"does the row exist yet" branch.

**Storage bucket + RLS + grants**, all in the same migration:

```sql
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true) on conflict (id) do nothing;

drop policy if exists "catalog images are publicly readable" on storage.objects;
create policy "catalog images are publicly readable" on storage.objects
  for select using (bucket_id in ('product-images', 'brand-logos', 'site-images'));

alter table public.home_hero       enable row level security;
alter table public.home_tiles      enable row level security;
alter table public.store_locations enable row level security;

drop policy if exists home_hero_select_public on public.home_hero;
create policy home_hero_select_public on public.home_hero for select using (true);

drop policy if exists home_tiles_select_published on public.home_tiles;
create policy home_tiles_select_published on public.home_tiles for select using (is_published);

drop policy if exists store_locations_select_published on public.store_locations;
create policy store_locations_select_published on public.store_locations for select using (is_published);

grant select on public.home_hero, public.home_tiles, public.store_locations to anon, authenticated;
revoke insert, update, delete on public.home_hero, public.home_tiles, public.store_locations
  from anon, authenticated;
```

RLS and grants must be written inline here — the new tables didn't exist when `0002`/`0003`
ran, and those files are not re-run.

**Seeds must reproduce the current copy exactly** — the hero row from `HomePage.tsx:81-97`
with `image_url = '/hero.jpg'`, 2 promo tiles, the 4 `SERVICES` tiles, the 4 `TICKER`
entries, and the three branches (`279 Spanish Town Road`, `8 Red Hills Road`,
`4 South Camp Road`), all `on conflict do nothing`. Otherwise the homepage visibly changes
the moment the migration runs while the old hardcoded arrays are still in the code. **Land
the seed and the `HomePage` rewire in the same commit.**

### Storage helper refactor — and its one real hazard

Every function in `apps/api/src/lib/storage.ts` is hardcoded to `PRODUCT_IMAGES_BUCKET`.
The load-bearing invariant is that `pathFromPublicUrl(url)` returns `null` for anything not
in that bucket — which is exactly what stops `cleanupOrphans()` and `deleteProduct()` from
touching external seed URLs (ARCHITECTURE §5). Generalizing must not weaken it.

```ts
export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const BRAND_LOGOS_BUCKET    = 'brand-logos';
export const SITE_IMAGES_BUCKET    = 'site-images';
export type Bucket = typeof PRODUCT_IMAGES_BUCKET | typeof BRAND_LOGOS_BUCKET | typeof SITE_IMAGES_BUCKET;

export async function uploadObject(bucket: Bucket, prefix: string, file: UploadedFile): Promise<UploadResult>;
export function        pathFromPublicUrl(bucket: Bucket, url: string): string | null;
export async function  removeObjects(bucket: Bucket, paths: string[]): Promise<void>;
export async function  removeObjectByUrl(bucket: Bucket, url: string): Promise<void>;
export async function  listAllObjectPaths(bucket: Bucket): Promise<string[]>;

/** Thin wrapper so the product path reads exactly as before. */
export async function uploadProductImage(productId: string, file: UploadedFile) {
  return uploadObject(PRODUCT_IMAGES_BUCKET, productId, file);
}
```

**Bucket first, no defaults.** A convenience default on `removeObjects` would mean a wrong
bucket silently leaves orphans behind — and `cleanupOrphans` is a *destructive sweep*.
Making the compiler stop at all 8 call sites (all in `admin/service.ts`: `deleteProduct`,
`addProductImage` ×2 compensating, `deleteProductImage`, and `cleanupOrphans` ×3) is worth
the 8 edits. Path scheme is unchanged: `${prefix}/${crypto.randomUUID()}${ext}`,
`upsert: false`. Prefixes: `productId`, `brandId`, or `'hero' | 'tiles' | 'locations'`.

**The hazard:** `cleanupOrphans()` lists *every object in a bucket* and deletes anything
not in its reference set. A bucket swept without a registered URL source deletes live site
images.

**How exposed is this today?** Less than it looks. `api.cleanupOrphans()` exists at
`apps/web/src/lib/api.ts:221`, but **nothing in `apps/web/src` calls it** — there is no
button, no menu item, no admin page wired to it. The endpoint is reachable only by manually
POSTing to `/api/v1/admin/images/cleanup-orphans` with a valid admin session and CSRF
token. So this is not a one-click disaster waiting for a mis-click; it's a loaded gun in a
drawer.

That lowers the urgency but not the requirement: the safety rails below are cheap, and the
moment anyone adds the obvious "Clean up unused images" button to the admin UI — which is
clearly what the client method was written for — the exposure becomes real and nobody will
re-audit the sweep logic at that point.

```ts
type Sweep = { bucket: Bucket; refs: () => Promise<string[]> };
const SWEEPS: Sweep[] = [
  { bucket: PRODUCT_IMAGES_BUCKET, refs: () => urlsFrom('product_images', 'url') },
  { bucket: BRAND_LOGOS_BUCKET,    refs: () => urlsFrom('brands', 'logo_url') },
  // site-images deliberately NOT swept — its refs span three tables; a missed
  // one is a deleted hero. Add only once all three are registered.
];
```

Two safety rails, both required:

1. **Leave `site-images` out of the registry initially.** Its URLs live in
   `home_hero.image_url`, `home_tiles.image_url` *and* `store_locations.image_url`.
2. **Tripwire:** if a sweep's `refs()` returns zero URLs while the bucket holds objects,
   skip that bucket and log a warning instead of deleting everything — the cheap guard
   against a refs query silently breaking on a renamed column.

`cleanupOrphans()` loops the registry and returns the same `OrphanCleanupResult` shape
(summed `deleted`, concatenated `paths`), so `api.cleanupOrphans()` and the admin UI don't
change.

### Brand logos and featured brands

`setBrandLogo(id, file)`: assert the brand exists (404) → read current `logo_url` →
`uploadObject(BRAND_LOGOS_BUCKET, id, file)` → update the row → on DB error,
`removeObjects(BRAND_LOGOS_BUCKET, [uploaded.path])` (the compensating-delete pattern from
`addProductImage`, `service.ts:262-309`) → on success, `removeObjectByUrl` the old one so
replacements don't accumulate. `deleteBrand()` also removes the logo object. Seeded brands
with external or NULL `logo_url` are untouched for free, because `pathFromPublicUrl`
returns `null` for them.

`brandCreateSchema` gains `isFeatured: z.boolean().default(false)` (inherited by
`.partial()`); `AdminBrandDTO` gains `isFeatured`. Public `BrandDTO` is unchanged —
`logoUrl` is already there, so it's the right shape for the rail as-is.

### API surface

**Public** (`catalog/routes.ts`), all parsing `langQuerySchema` inline:

```
GET /home            -> HomeContentDTO { hero, promos, services, ticker, featuredBrands, locations }
GET /locations       -> StoreLocationDTO[]
GET /brands/featured -> BrandDTO[]
```

`GET /home` as one payload matters: `HomePage` already fires 3 requests and would otherwise
go to 8. `GET /locations` is separate and small because `Footer` renders on *every* page and
must not pull the whole homepage. No `/brands/:slug` route exists, so `/brands/featured`
has no shadowing risk — but register it above any future one, per the `/products/featured`
precedent.

**Admin** — a new `// --- Homepage ---` / `// --- Locations ---` section inside the existing
`admin/` module (there is no separate brands or categories module either; resources live in
`admin/` split by banner comments):

```
GET   /admin/home                      -> { hero, tiles }  (all slots, unpublished included)
PATCH /admin/home/hero
POST  /admin/home/hero/image           upload.single('file')
GET/POST/PATCH/DELETE /admin/home/tiles[/:id]
POST  /admin/home/tiles/:id/image
GET/POST/PATCH/DELETE /admin/locations[/:id]
POST  /admin/locations/:id/image
POST  /admin/brands/:id/logo
```

Params via `idParamSchema.parse(req.params)` inline, bodies via `validate({ body })`, `204`
on delete — the existing pattern exactly. Reuse the multer instance and the
`mimetype.startsWith('image/')` guard already at the top of `admin/routes.ts`.

New schemas pair `xCreateSchema` with `xUpdateSchema = xCreateSchema.partial()` and export
inferred types. Every `*Es` field uses a shared fragment that nulls blanks:

```ts
/** Spanish siblings: blank -> null, so pick()'s fallback works. */
const esText = z.string().trim().max(4000).nullable().optional()
  .transform((v) => (v && v.length ? v : null));
```

### Shared DTOs

Public (locale-resolved server-side, so every field is a plain `string`): `HomeHeroDTO`,
`HomeTileDTO` (+ `HomeTileSlot = 'promo' | 'service' | 'ticker'`), `StoreLocationDTO`, and
the aggregate `HomeContentDTO`.

Admin supersets carrying the `_es` editing surface, mirroring how `AdminCategoryDTO extends
CategoryDTO`: `AdminHomeHeroDTO`, `AdminHomeTileDTO`, `AdminStoreLocationDTO`,
`AdminProductSpecDTO`, `AdminProductHighlightDTO`. Amend `AdminProductDTO` with
`nameEs`/`shortDescriptionEs`/`descriptionEs` and narrow `specs`/`highlights` to the admin
variants (legal, since each extends its public counterpart); `AdminCategoryDTO` with
`labelEs`; `AdminBrandDTO` with `isFeatured`. `toAdminProductDTO` spreads
`toProductDetailDTO(p, [])` then overwrites `specs`/`highlights` with its own mapping.

Public `ProductSummaryDTO`, `ProductDetailDTO`, `CategoryDTO`, `BrandDTO` and
`AgentProductDTO` are **unchanged** — that's the payoff of server-side resolution.

### Web

- New `components/home/{HeroSection,PromoTiles,ServiceTiles,BrandRail,LocationsSection}.tsx`.
  `BrandRail` reuses the existing `Rail` primitive; logos go through `ImageWithFallback`.
- `HomePage.tsx` shrinks substantially: delete `TICKER`, `SERVICES`, the hardcoded hero
  block and the `const [promoA, promoB] = categoryList` borrow; feed the new components
  from one `useAsync(() => api.home(), [])`.
- `Footer.tsx:99-101` — replace the hardcoded `Kingston, Jamaica / Islandwide delivery /
  Mon–Sat 8am–5pm` block with the real locations. `Header.tsx:135` keeps a translated
  strapline (it's copy, not data).
- New `components/admin/ImageUploadField.tsx` (upload + preview + replace, single image).
- **`/admin/homepage` → `AdminHomePage.tsx`** — one page, three blocks: hero form + image,
  then one `TileSection` component parameterized by slot, rendered per slot. Reuses the
  `AdminBrandsPage` table + inline-form shape.
- **`/admin/locations` → `AdminLocationsPage.tsx`** — its own page, cloned from
  `AdminBrandsPage.tsx` (the simplest existing CRUD page). Locations are business data
  consumed by the Footer on every page, not homepage content; burying them under "Homepage"
  is where an admin would never look.
- Featured-brand checkbox and logo upload go on the **existing** `AdminBrandsPage`, next to
  the brand they belong to. No new page.
- `AdminLayout.tsx` sidebar gains `Homepage` and `Locations`; `App.tsx` gains both routes.

---

## 6. (Feature) "Clean up unused images" button

The sweep endpoint has existed all along with no way to reach it: `api.cleanupOrphans()`
sits at `apps/web/src/lib/api.ts:221` and **nothing in `apps/web/src` calls it**. The
client method was plainly written for a button nobody added. Add the button — but add the
preview that makes it safe first.

### The problem with a bare button

`cleanupOrphans()` (`admin/service.ts:577`) lists every object in the bucket, subtracts
the URLs referenced by `product_images`, and deletes the remainder — with no preview and no
undo. A button wired straight to that asks an admin to authorise deleting an unknown number
of files they have never seen. That is the wrong shape for an irreversible action, and it
is also the exact operation §5 flags as the one that can destroy client data.

### Add a dry run — this is the load-bearing change

Give the endpoint a `?dryRun=true` mode that resolves the identical orphan list and deletes
nothing. The button then scans first and the confirmation shows a real file list, so the
admin is agreeing to something specific.

**`packages/shared/src/index.ts`** — extend the existing result DTO:
```ts
export interface OrphanCleanupResult {
  /** Objects deleted — or, on a dry run, the number that would be. */
  deleted: number;
  paths: string[];
  /** True when nothing was actually removed. */
  dryRun: boolean;
}
```

**`admin/service.ts`** — `cleanupOrphans(dryRun = false)`; compute `orphans` exactly as
today, then `if (!dryRun) await removeObjects(orphans);` and return `{ deleted, paths,
dryRun }`. Keep the function pinned to `PRODUCT_IMAGES_BUCKET` (see the §5 sweep registry).

**Add the tripwire here too**, since the button is what makes it matter: if `referenced`
resolved to zero URLs while the bucket holds objects, the reference query is broken, not
the bucket — log a warning and return `{ deleted: 0, paths: [], dryRun: true }` rather than
deleting everything. Ten lines that turn a silently-renamed column from a catastrophe into
a log line.

**`admin/schema.ts`** — a query schema in a new `// --- Storage maintenance ---` section,
using the `z.preprocess` boolean-from-string pattern already used by
`imageUploadMetaSchema`:
```ts
export const orphanCleanupQuerySchema = z.object({
  dryRun: z.preprocess((v) => v === 'true' || v === true, z.boolean().optional()),
});
```

**`admin/routes.ts`** — parse it inline from `req.query`, per the repo's params/query
convention:
```ts
router.post('/images/cleanup-orphans', ah(async (req, res) => {
  const { dryRun } = orphanCleanupQuerySchema.parse(req.query);
  res.json(await svc.cleanupOrphans(dryRun === true));
}));
```

**`apps/web/src/lib/api.ts`** — `cleanupOrphans: (dryRun = false) => request<OrphanCleanupResult>(
'/admin/images/cleanup-orphans', { method: 'POST', query: dryRun ? { dryRun: 'true' } : undefined })`.
`request` already supports `query` on any method via `buildUrl`.

### The UI

Place it in the **`AdminProductsPage` header**, beside `+ New product` — that is where
product images accumulate and where an admin goes looking for image housekeeping. Use
`variant="outline"` so it doesn't compete with the accent "New product" call to action.

Flow, using the primitives already on that page (`Button`, `ConfirmDialog`, `Loader`):

1. Click → `api.cleanupOrphans(true)` (scan). Disable the button and show the `Loader`
   while it runs — the sweep lists the whole bucket and is not instant.
2. Scan returns zero → a plain inline "No unused images found." No dialog; there is nothing
   to confirm.
3. Scan returns *n* → `ConfirmDialog` with `danger` and `busy`, titled
   `Delete N unused images?`, whose message names what is being swept and lists the paths
   (scrollable, `max-h-48 overflow-auto`, capped at ~20 with "…and N more"). `ConfirmDialog`
   takes `message?: string`, so either widen it to accept `ReactNode` or render the list
   into the message string — widening is cleaner and benefits every other caller.
4. Confirm → `api.cleanupOrphans()` (real) → show `Deleted N unused images.` and `reload()`
   the product list so any now-missing thumbnails refresh.
5. Any failure surfaces the `ApiError` message inline, matching how the page already
   renders `error`.

Copy matters here. Say **"unused product images"**, not "unused images" — after the §5
storage refactor the sweep registry also covers `brand-logos`, and the button must name
exactly what it touches. Never `window.confirm`, per CLAUDE.md.

### Ordering

This lands **after** the §5 storage refactor and sweep registry (step 9 below), never
before. The button is precisely what converts §5's latent hazard into a reachable one, so
the registry, the `site-images` exclusion and the tripwire must all be in place first.

---

## Landing order

Each step leaves the app working. **§4 (bilingual) ships before §5 (homepage)** — the new
homepage tables should bake in the `_es` convention §4 establishes, rather than being
retrofitted.

1. **§1 Select fix**, **§2 blue token**, **§3 logo** — small, isolated, immediately visible.
   §3 is blocked only on the client saving `logo.png`.
2. `packages/shared` DTOs + `Locale` widened — everything else typechecks against this.
3. Write `0009_i18n_content.sql`; **run it by hand** in the Supabase SQL Editor before
   step 4 is testable.
4. api: `types/db.ts` → `lib/locale.ts` → `catalog/mappers` → `catalog/service` →
   `catalog/routes` → `admin/{schema,mappers,service,routes}` → fix the `agent/service.ts`
   call sites. Run `npm test` here — `catalog.test.ts` and `admin.test.ts` will need the new
   signatures, and any test asserting on RPC args needs `p_lang`.
5. web: `lib/api.ts` (`setApiLocale` + `buildUrl` injection) — **must precede** i18n wiring.
6. web: `i18n/*`, `main.tsx`, the `key={locale}` on `<Routes>`, `LocaleSwitcher`.
7. web: `ui/*` primitives gain label props — **must precede** page string extraction.
8. web: extract strings page by page (~215 keys); `en.ts` first, `es.ts` last.
   *§4 is independently shippable here.*
9. `lib/storage.ts` refactor + 8 call sites + the `cleanupOrphans` registry and tripwire —
   **must precede any new upload route**.
10. Write `0010_homepage_content.sql`; **run it by hand**.
11. api home/locations/featured-brands services, routes, mappers.
12. web `HomePage`/`Footer` rewire + `AdminHomePage` + `AdminLocationsPage`.
13. **§6 cleanup button** — dry-run mode, then the `AdminProductsPage` control. Last,
    because it is what makes step 9's sweep reachable by a human.
14. Docs: `ARCHITECTURE.md` §5 (new tables + bucket), §6 (new endpoints), §7 (i18n), §10
    (remove "i18n out of scope"). `CLAUDE.md` "Latest migration: `0005_search`" →
    `0010_homepage_content` — it is already stale at `0008`.

Hard dependencies: 3→4, 5→6, 7→8, 9→10/11, **9→13**.

Migrations are run **by hand** in the Supabase SQL Editor, in order, never from code.

---

## Risks

1. **`cleanupOrphans` deleting site content** — the highest-severity item, and §6 is what
   makes it reachable: today there is no caller in `apps/web/src`, so the endpoint needs a
   hand-rolled POST. Once the button exists, an admin can trigger it in one click.
   Non-negotiable before §6 ships: `site-images` is a distinct bucket, stays out of the
   sweep registry until all three URL sources are registered, the zero-refs tripwire is in
   place, and the button confirms against a real dry-run file list rather than a count.
2. **Dropping `search_vector` drops its GIN index** — omit the `create index` and every
   search silently degrades to a seq scan, unnoticed until the catalog grows.
3. **PostgREST 300 on the RPC** — both old signatures must be dropped; `create or replace`
   overloads rather than replaces.
4. **Grants die with the function** — re-issue `revoke`/`grant` against the new 10-arg
   signature or every search 500s.
5. **`''` vs `NULL` in `_es` columns** — guard at both ends (zod transform + `pick()`).
6. **Admin DTOs silently localizing** — prevented structurally by the defaulted trailing
   mapper parameter. Do not "simplify" it to an ambient locale later.
7. **`ui/*` primitives calling `t()`** would turn the admin back-office Spanish. Props, not
   `t()`.
8. **Checkout form loss on locale switch** — hide the switcher on `/checkout`.
9. **Translation debt** — ~215 Spanish strings plus every product's `_es` fields is a
   content project, not a code one. The fallback design makes partial translation safe;
   ship the code before the content is complete.
10. **`0010` seeds must reproduce the current copy exactly**, and land in the same commit as
    the `HomePage` rewire.

---

## Verification

**Per change:**

1. **Select** — `npm run dev`, open `/admin/products/<id>`. Confirm the Category menu stays
   open and tracks the trigger while the page scrolls; scrolling *inside* a long category
   list does not close it; a select near the viewport bottom flips upward; arrow keys keep
   the highlighted option visible. Repeat on `/admin/categories`, `/admin/orders` and an
   order detail page (the two beside `overflow-x-auto` tables). Check at mobile width via
   `resize_window` — device emulation was the original reason this isn't a native
   `<select>`.
2. **Blue** — `grep -rn "282d53\|1b1f3b" apps/web/src apps/web/index.html` returns nothing.
   Screenshot the header, footer, a primary button and a focused input for the ring and
   hover states.
3. **Logo** — renders correctly on the dark blue header (no white box), in the light footer,
   in the admin sidebar and on the login page; favicon appears in the tab.
4. **Bilingual** — run `0009`. With the switcher on ES: nav, filters, product detail, cart
   and checkout are Spanish, **and the admin back-office is still entirely English**. A
   product with `name_es` set shows Spanish; one without falls back to English rather than
   blanking. Clear a `name_es` field in the admin, save, and confirm the storefront shows
   English rather than a blank name. Search a Spanish-only term and confirm it returns the
   product; search an English term with the site in Spanish and confirm untranslated
   products still match (the fallback tsquery). Open a fresh browser profile with the
   language set to Spanish and confirm the site opens in Spanish with no stored preference.
   Place an order in Spanish and confirm `AdminOrderDetailPage` shows English line names.
5. **Homepage CMS** — run `0010`, then confirm the page renders **identically** to before
   (the seeds reproduce the current copy). Then from the admin: upload a hero image, edit
   the headline, change the "In stock now" tile's image and title, mark two brands featured
   and upload a logo, edit a location — and confirm each appears on `/` and in the footer.
   Confirm `GET /api/v1/home` returns one payload.
6. **The cleanup button and the orphan-sweep regression** — the one failure mode that
   destroys client data, so test it deliberately rather than assuming:
   - Upload a hero image and a brand logo first. Click **Clean up unused product images**,
     and confirm the dry-run list names **neither of them**. Complete the delete, then
     confirm both still exist and still render on `/`.
   - Upload a product image, then delete that product's image row from the admin so the
     object is genuinely orphaned. Confirm the scan lists exactly that file, the count
     matches, and confirming removes it.
   - With no orphans present, confirm the button reports "No unused images found" and opens
     no dialog.
   - Exercise the tripwire: temporarily point the reference query at an empty table (or a
     bad column) and confirm the sweep refuses to delete and logs a warning instead of
     emptying the bucket. Revert.
   - Confirm Cancel in the dialog deletes nothing.

**Repo-wide, before handing back:**

```bash
npm run typecheck && npm run lint && npm test
```

`apps/api` has hermetic Vitest + supertest coverage (Supabase and JWKS mocked at the module
boundary) for app wiring, catalog reads, auth and admin role-gating. Add cases for the new
public `GET /home`, `GET /locations` and `GET /brands/featured`, for `?lang=es` resolution
and its English fallback, and for admin role-gating on the new `/admin/home`,
`/admin/locations` and brand-logo routes.
