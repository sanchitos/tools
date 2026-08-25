# Walmart-style storefront redesign — execution plan

## Context

The customer likes the current Tools Jamaica storefront but wants the **look and feel of
[walmart.co.cr](https://www.walmart.co.cr/)**. This is a **layout + density + information-architecture**
change, not a rebrand:

- **The colour palette does NOT change.** Drill Navy `#014b7a`, Safety Orange `#f28c00`, and every
  token in `apps/web/src/styles/tokens.css` stay exactly as they are. Walmart's blue/gold is
  studied for *structure only*. Do not add or edit a single colour value.
- **A real cart IS now in scope** (decided with the user). Specifically: a **guest cart** in
  `localStorage` (no customer login), and checkout that **saves a real order to the database** with an
  **admin Orders screen**. **No online payment** — no provider, no card capture. The customer submits an
  order request; the shop confirms and collects as it does today.
- **Still out of scope:** customer accounts/signup, payments, wishlists, reviews submission.
  `profiles.role = 'customer'` stays unused.
- Outcome: a denser, more retail-feeling storefront — multi-tier sticky header with prominent search and
  a cart, department circle rail, product rails, 4–5-up grids, real mobile filter drawer, a
  Walmart-anatomy product card with a working Add button, a cart drawer + cart page, a checkout form,
  and an admin Orders back-office.

## Shape of the work

**Part A — Steps 1–8: the visual redesign** (front-end only, no API/DB changes).
**Part B — Steps 9–15: cart, checkout and orders** (DB migration + new API module + new pages).

Part A and Part B are independent enough that A can ship first, but Step 4 (ProductCard) and Step 7
(PDP) each contain a small hook that Part B fills in — both are called out inline.

Steps 1–8 are `apps/web` only — no API or DB changes. Steps 9–14 touch `packages/shared`,
`apps/api`, and `apps/web`, and include **one SQL migration the user must run by hand**.
Step 15 is optional and gated on the user.

### What Walmart actually does (reference summary — you do not need to browse the site)

- **Header: 3 sticky tiers** — (1) thin dark utility bar with phone/help, (2) main brand bar with
  hamburger + logo + big search + right icon cluster, (3) light bar with location picker + promo links.
  Mobile collapses to 3 rows: brand row (icon-only actions) / full-width search / light location row.
- **No hover mega-menu.** Departments live in a **left slide-in drawer** off the hamburger, and as a
  **circular-icon carousel** on the homepage (72px circle, 2px ring, icon inside, 2-line label below).
- **Homepage rhythm:** marquee → circle rail → asymmetric hero (60% carousel / 40% two stacked tiles)
  → banner row → product rail → banner row → product rail → services row → newsletter → 6-col footer.
  Every rail = **centered bold title + right-aligned "Ver todo" + 5-up with arrows**.
- **Product card (245×415, radius 5px, soft shadow, no border):** wishlist top-right, promo badge
  top-left over the image, ~1:1 image, seller line, **compact CTA button, then price, then discount
  chip, then a 2-line title *below* the price**. CTA is always visible, never hover-only.
- **Results pages:** 5-up on category pages (no rail, subcategory chips instead), 4-up on search
  (230px left rail of collapsible checkbox facets + price range). Mobile: 2-up, `[Sort ▾] [Filter ⚙]`
  pill row, right filter drawer with a sticky `CLEAR | APPLY` bar.
- **PDP:** vertical thumbnail strip at far left, gallery 58%, info column 37%. Small 16px H1, stars,
  big 32px price, bordered "buy box" with one full-width CTA, sticky mini buy-bar on scroll, tabbed
  Description/Specs card, related rail.
- **Density is the whole point:** ~1366px container in a 1440 viewport, 12–15px type, weight (not
  size) carries hierarchy, one soft shadow, tight radii (3/4/5px), thin line icons.

---

## Step 0 — Ground rules (read before touching anything)

1. **Never** edit colour values in `apps/web/src/styles/tokens.css`. You may **add** non-colour tokens
   (font sizes, one shadow, container width) in Step 1.
2. **No payment code, ever, in this plan.** No provider SDK, no card fields, no `payment_status`.
   Checkout ends at "order request received".
3. Obey `CLAUDE.md` UI conventions: shared `Select` (never native `<select>`), `ConfirmDialog`
   (never `window.confirm`), `Loader` (never "Loading…" text), `ImageWithFallback` for every remote
   image, semantic Tailwind tokens only — **no raw hex, no arbitrary colour classes**.
4. Reuse what exists: `Container`, `Button`, `Badge`, `Loader`, `Select`, `ImageWithFallback`,
   `useAsync`, `formatPrice`, `api.*`, and `lib/contact.ts` (`PHONE_DISPLAY`, `PHONE_TEL`, `WHATSAPP_URL`).
5. **Add one helper to `apps/web/src/lib/contact.ts`** before Step 4 — `WHATSAPP_URL` already ends in
   `?text=<encoded default>`, so per-product links must not append a second query string:
   ```ts
   const WHATSAPP_NUMBER = '18764300550';   // already defined in the file
   export const whatsappUrl = (message: string) =>
     `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
   ```
   Use `whatsappUrl(...)` for every product CTA; keep bare `WHATSAPP_URL` for the generic FAB/footer links.
6. Run `npm run typecheck` and `npm run lint` after each step. Both must pass before moving on.
7. Work incrementally and commit-sized: finish a step fully, verify, then start the next.

---

# Part A — Visual redesign

## Step 1 — Extend the token layer (non-colour only)

**`apps/web/src/styles/tokens.css`** — append to `:root`, do not modify existing lines:

```css
--shadow-card: 0 3px 8px 0 rgb(11 28 48 / 0.12);   /* Walmart's ambient card shadow, navy-tinted */
--container-max: 1440px;                            /* was 1280px — denser, near-full-bleed */
```

**`apps/web/tailwind.config.js`** — extend only:

- `boxShadow`: add `card: 'var(--shadow-card)'`
- `fontSize`: add the small steps the current 7-step scale lacks —
  `'label-xs': ['11px', { lineHeight: '14px', fontWeight: '600' }]`,
  `'body-sm': ['14px', { lineHeight: '20px' }]`,
  `'body-xs': ['13px', { lineHeight: '18px' }]`,
  `'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '700' }]`,
  `'display-md': ['40px', { lineHeight: '48px', fontWeight: '700' }]`
- `maxWidth.container` already resolves to `var(--container-max)` (line 97) — nothing to do there;
  bumping the CSS var is enough.

**`apps/web/src/components/ui/Container.tsx`** — tighten gutters for the denser look:
`px-4 lg:px-8` (was `px-4 lg:px-10`).

---

## Step 2 — New shared primitives

Create these in `apps/web/src/components/ui/` and export every one from `ui/index.ts`.
Keep them small, typed, token-only. These are the missing pieces the whole redesign depends on —
build them first.

| File | API | Notes |
|---|---|---|
| `Icon.tsx` | `<Icon name={IconName} className? />` | One inline-SVG set, `stroke="currentColor" strokeWidth={1.5} fill="none"`, 24×24 viewBox. Names needed: `search, menu, close, chevronDown, chevronUp, chevronLeft, chevronRight, cart, user, phone, whatsapp, star, starHalf, filter, sort, grid, truck, shield, tag, check, arrowRight, headset, pin, wrench`. Export `type IconName`. Thin uniform stroke — no filled icons except `search` inside the search button. |
| `Input.tsx` | `<Input value onChange type? placeholder? icon? className? ...InputHTMLAttributes />` | `rounded border border-border bg-surface px-3 py-2 text-body-sm focus:ring-2 focus:ring-primary` |
| `Stars.tsx` | `<Stars rating={number} count?={number} size?: 'sm'\|'md' />` | Renders 5 stars in `text-accent`, half-star supported; when `count` is given append `(count)` in `text-label-sm text-ink-muted`. **Render nothing at all when `rating <= 0`.** |
| `Breadcrumbs.tsx` | `<Breadcrumbs items={{label, to?}[]} />` | `text-label-sm text-ink-muted`, `›` separators, last item `text-ink font-semibold`, no link. |
| `Drawer.tsx` | `<Drawer open side="left"\|"right" onClose title? footer? children />` | Portal to `document.body`, `z-[150]`, `bg-ink/50` backdrop, slide transition, Esc + backdrop close, `overflow-y-auto` body, optional sticky `footer` slot. Locks `body` scroll while open. Model it on the existing `ConfirmDialog.tsx` portal/Esc pattern. |
| `Accordion.tsx` | `<Accordion title defaultOpen? children />` | Button header with `chevronUp`/`chevronDown` on the right, `border-b border-border`, animated height not required. |
| `Rail.tsx` | `<Rail title? viewAllHref? children />` | Horizontal scroll container (`flex gap-gutter overflow-x-auto snap-x scroll-smooth [scrollbar-width:none]`) + **desktop-only** circular prev/next arrow buttons (`hidden lg:flex`, `rounded-full border border-border bg-surface shadow-sm`) that scroll by one page width via a ref. Title row = **centered `font-display` bold heading with the "View all" link right-aligned** (Walmart's signature pairing). Arrows disable at the ends. |
| `Skeleton.tsx` | `<Skeleton className />` | `animate-pulse rounded bg-surface-strong`. |
| `IconButton.tsx` | `<IconButton icon label onClick? className? />` | Square, `aria-label={label}`, `rounded hover:bg-surface-muted`. |

---

## Step 3 — Header: three sticky tiers + search + department drawer

Rewrite **`apps/web/src/components/Header.tsx`**. Whole `<header>` stays `sticky top-0 z-40`.

**Tier 1 — utility bar** (`bg-primary-dark text-primary-fg`, `h-9`, `text-label-sm`, `hidden sm:block`):
left = `<Icon name="headset"/> Call us: {PHONE_DISPLAY}` as a `tel:` link; right = "Tools, Hardware &
Supplies — Jamaica" + a WhatsApp link.

**Tier 2 — main bar** (`bg-primary text-primary-fg`, `h-16 lg:h-[74px]`), flex row:
1. **Hamburger** `IconButton icon="menu" label="All departments"` — `lg:hidden` is WRONG here; show it
   at **all** widths (Walmart keeps it on desktop). Opens the department drawer (below).
2. **Logo wordmark** — keep the existing `TOOLS` + `JAMAICA` treatment, but on the navy bar it must be
   `text-primary-fg` / `text-accent`. Links to `/`.
3. **Search bar** — `flex-1 max-w-[580px] mx-4 hidden md:flex`. An `Input` (`rounded-l bg-surface
   text-ink`, placeholder `"What are you looking for?"`) butted against a **solid orange square
   button** (`bg-accent text-accent-fg rounded-r px-4`) holding the `search` icon. Submitting
   navigates to `/shop?q=<value>`.
4. **Right cluster** — icon left of a `text-label-sm font-semibold` label, icon-only below `lg`:
   `Icon phone` → "Call us" (`tel:`), `Icon whatsapp` → "WhatsApp" (`WHATSAPP_URL`),
   `Icon user` → "Admin" (`/admin`), and **`Icon cart` → "Cart"** as the rightmost item.
   The cart button opens the cart drawer (Step 11) and carries a **count bubble**: `absolute -right-1
   -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-label-xs
   text-accent-fg`, rendered only when `count > 0`.
   *If you ship Part A alone, omit just this one item; Step 11 adds it. Everything else is final.*

**Tier 3 — light bar** (`bg-surface-muted border-b border-border h-11`, `hidden lg:flex`):
left = `Icon pin` + "Kingston, Jamaica — islandwide delivery" (static text, `text-body-xs`);
right = 3–4 promo links styled like Walmart's pills — `Featured` → `/shop?sort=featured`,
`In stock` → `/shop?inStock=true`, `Top brands` → `/shop` — plus `Shop all` → `/shop`.
The one highlighted pill uses `bg-accent text-accent-fg rounded px-3 py-1`; the rest are plain links.

**Mobile row** (`md:hidden`): a **second full-width search row** under tier 2, same input+orange-button
treatment, `bg-primary px-4 pb-3`. So mobile = brand row + search row (tier 3 hidden).

**Department drawer** — new `apps/web/src/components/DepartmentDrawer.tsx`:
`Drawer side="left" title="All departments"`, fed by `api.categories()` (fetch once in the drawer via
`useAsync`, only when first opened). Each row: `ImageWithFallback` thumb (or `Icon wrench` fallback) +
`label` + `productCount` in muted text + `chevronRight`, linking to `/shop?category=<slug>`.
Categories are **flat** (`CategoryDTO` has no `parentId`) — do **not** attempt a nested/second-level
panel. Pin `Shop all products` at the top.

State lives in `Header.tsx` (`const [menuOpen, setMenuOpen] = useState(false)`). Close the drawer on
route change (`useLocation()` effect).

---

## Step 4 — ProductCard: Walmart anatomy

Rewrite **`apps/web/src/components/ProductCard.tsx`**. Keep it a single `<Link>` wrapper, but the CTA
must be a real nested control — use a `<button>` with `onClick={(e) => { e.preventDefault();
e.stopPropagation(); window.open(waUrl, '_blank', 'noopener'); }}`.

Card shell: `rounded-card bg-surface shadow-card border-0 p-3 pb-4 flex flex-col h-full transition-shadow hover:shadow-pop`.

Stack, **in this exact order** (this ordering is the signature Walmart move — button above price,
title below it):

1. **Image block** — `relative aspect-square`, `ImageWithFallback` with `imgClassName="object-contain p-2"`
   (contain, not cover — hardware product shots on white).
   - **Badge top-left, overlapping the image**: `Featured` → `Badge tone="accent"`; else if
     `stock > 0 && stock <= 5` → `Badge tone="error"` "Low stock". `absolute left-2 top-2 text-label-xs`.
   - **Out of stock**: keep the existing full-width `bg-ink/80` strip across the image bottom.
2. **Brand line** — `Sold by {brand?.name ?? 'Tools Jamaica'}`, `text-body-xs font-semibold text-ink-muted`.
3. **CTA** — compact and **always visible**. *(Part A ships an `Enquire` WhatsApp button; Step 12
   converts it to a real `Add` button. Executing straight through? Build the Step 12 version now.)*
   `inline-flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-label-sm font-semibold
   text-primary-fg hover:bg-accent transition-colors` with the `whatsapp` icon. `href` =
   `` `${WHATSAPP_URL}?text=${encodeURIComponent(`Hi, I'm interested in ${product.name} (${product.sku ?? product.slug})`)}` ``
   — **check `lib/contact.ts` first**: if `WHATSAPP_URL` already carries a query string, append with `&`.
   Disabled (`opacity-60 pointer-events-none`) when out of stock.
4. **Price** — `text-headline-md font-bold text-accent` via `formatPrice(product.price)`.
   *(There is no `compareAtPrice` in the DTO, so there is no strikethrough/discount chip. Do not fake
   one and do not add a DB column — that is Step 9, optional.)*
5. **Title** — `line-clamp-2 text-body-sm text-ink` (note: **not** `font-display`, **not** bold, and it
   sits *below* the price — deliberate, matching Walmart).
6. **Rating row** — `<Stars rating={product.rating} count={product.reviewCount} size="sm" />`.
   These fields already exist end-to-end and are currently rendered nowhere — free win. `Stars`
   renders nothing when `rating <= 0`, so seedless products degrade cleanly.
7. **Meta line** — `mt-auto pt-2 border-t border-border`, `text-label-xs text-ink-muted`, showing
   `SKU: {sku}` when present, else the category label.

Cards must be uniform height in a grid: parent grid cells need `h-full` on the card root.

---

## Step 5 — HomePage

Rewrite **`apps/web/src/pages/HomePage.tsx`** to this section order. Reuse the existing hero image
(`/hero.jpg`) and the existing `TRUST` array idea.

1. **Promo ticker** — new tiny local component: `bg-accent text-accent-fg h-10 overflow-hidden`, a
   `flex whitespace-nowrap animate-[marquee_30s_linear_infinite]` strip repeating 3–4 static promo
   strings (e.g. "Islandwide delivery", "Trade pricing available — ask us", "Genuine brands only").
   Add the `marquee` keyframes to `tailwind.config.js` `extend.keyframes`/`extend.animation`.
   Respect `motion-reduce:animate-none`.
2. **Department circle rail** — `api.categories()` inside a `<Rail>`. Each cell `w-24 shrink-0
   snap-start text-center`: a `h-[72px] w-[72px] rounded-full border-2 border-border overflow-hidden
   bg-surface` holding `ImageWithFallback` (`object-cover`), with a 2-line `text-label-xs` label
   underneath. Links to `/shop?category=<slug>`. Shows ~4.5 circles on mobile via horizontal scroll,
   all of them on desktop. `Loader` while loading.
3. **Hero row — asymmetric 60/40** — `grid grid-cols-1 gap-gutter lg:grid-cols-[3fr_2fr]`:
   - **Left**: the existing hero panel (image + navy scrim + eyebrow + `display-lg` headline + copy +
     the two CTAs), now constrained to `aspect-[2.4/1] lg:aspect-auto lg:h-[377px]` and `rounded-card
     overflow-hidden`. A carousel is **not** required — one static hero panel is fine.
   - **Right**: **two stacked promo tiles**, each `h-[calc(50%-0.5rem)] lg:h-[179px] rounded-card
     overflow-hidden relative` with a category image, navy gradient scrim, a `headline-sm` label and a
     small orange pill CTA. Point them at `/shop?sort=featured` and `/shop?inStock=true`.
     Pick their images from the first two `api.categories()` results so nothing new needs uploading.
4. **Services / trust row** — replaces the old trust bar: `bg-surface-muted border-y border-border`,
   `grid grid-cols-2 gap-6 py-8 lg:grid-cols-4`, each cell = `Icon` (`truck`, `shield`, `tag`, `headset`)
   in an orange square + left-aligned two-line text. Keep the existing copy where it still fits
   (Best Prices / Widest Variety / Top Brands) and add a delivery/contact item.
5. **Featured rail** — `<Rail title="Featured this week" viewAllHref="/shop?sort=featured">` over
   `api.featured()`, cards `w-[220px] shrink-0 snap-start`. 5-up on desktop by width, swipe on mobile.
6. **Full-width banner strip** — a single `rounded-card` navy panel with an orange CTA
   ("Need it today? WhatsApp us" → `WHATSAPP_URL`). This is the `admanager` slot equivalent.
7. **Departments grid** — keep the existing `#departments` tile grid, but denser:
   `grid grid-cols-2 gap-gutter md:grid-cols-4 lg:grid-cols-6`, tiles `aspect-square`.
8. **"New arrivals" rail** — `api.listProducts({ sort: 'name', pageSize: 12 })` in a `<Rail
   title="More from the catalog" viewAllHref="/shop">`. *(There is no `newest` sort in the API — do not
   invent one; use `name` or `featured`. See Step 9 if the user wants a real one.)*
9. **CTA band** — keep the existing `bg-surface-inverse` band.

Every rail/grid section must render a `Loader` while loading and a muted empty-state line when the
list comes back empty. Never leave a bare "Loading…" string.

---

## Step 6 — ShopPage: density, mobile drawer, chips

Rewrite **`apps/web/src/pages/ShopPage.tsx`**. **Preserve the existing URL-as-source-of-truth logic
verbatim** — the `useSearchParams` reads, the `update(mutate, resetPage)` helper, the 300ms debounced
`searchInput`, and `useAsync(() => api.listProducts(query), [sp.toString()])`. Only the presentation
changes.

- **Breadcrumbs** at the top, full width: `Home › Shop › {category label when exactly one is selected}`.
- **Subcategory chip rail** — a horizontally-scrolling row of `api.categories()` chips
  (`h-10 rounded border border-border px-4 text-body-xs whitespace-nowrap`, selected =
  `border-primary bg-surface-strong text-primary font-semibold`). Clicking toggles that category in the
  URL through the existing `update()` helper. Hidden when the list is empty.
- **Controls row**:
  - Desktop: `{total} products` on the left (`text-body-sm`), `Sort by` + the shared `Select` on the right.
  - Mobile (`lg:hidden`): a **2-up pill row** — `[ Sort ▾ ]` (the shared `Select`, full width) and
    `[ Filters ⚙ ]` button that opens the filter `Drawer`. `{total} products` **centered** below it.
    The Filters button shows an orange count bubble when any filter is active.
- **Filters** — extract the existing `FilterGroup` / `Check` local components into a single new
  `apps/web/src/components/ShopFilters.tsx` so the same markup renders in **both** places:
  - `lg:` and up → the persistent `<aside className="hidden lg:block w-[230px] shrink-0">` left rail,
    each group wrapped in the new `Accordion` (Category and Brand `defaultOpen`).
  - below `lg` → inside `<Drawer side="right" title="Filters">` with a **sticky footer**
    `[ Clear all ] [ Apply ]` (Apply just closes the drawer — the URL already updated live).
  Keep the same facets: Category, Brand, Price (Min/Max number inputs — now the `Input` primitive),
  In-stock toggle. *(There are no facet counts and no price-range endpoint in the API — do not display
  counts and do not build a dual-handle slider.)*
- **Results grid** — go dense: `grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`.
  (Tailwind's `grid-cols-2` is already `repeat(2, minmax(0,1fr))`, so the CLAUDE.md overflow rule is
  satisfied without a `grid-cols-1` base.) Bump `PAGE_SIZE` from 12 to **20** so 4/5-up rows fill evenly.
- **Pagination** — replace Prev/Page X of Y/Next with a **numbered pager**: first/prev, up to 5 numeric
  page buttons windowed around the current page with `…` truncation, next/last. Current page =
  `bg-primary text-primary-fg`. Put it in a new `apps/web/src/components/ui/Pagination.tsx`
  (`{ page, pageCount, onChange }`) and export it. **Do not build infinite scroll** — it fights the
  URL-synced `page` param that the rest of the page depends on.
- **Loading** — while `loading`, render a grid of `Skeleton` cards matching the column count instead of
  the centred `Loader`, so the layout does not jump. Keep `Loader` for first paint if simpler.

---

## Step 7 — ProductDetailPage

Rewrite **`apps/web/src/pages/ProductDetailPage.tsx`**.

- **Breadcrumbs** — `Home › Shop › {category.label} › {product.name}` using the new primitive.
- **Two columns**: `grid grid-cols-1 gap-10 lg:grid-cols-[58fr_37fr]`.
- **Gallery (left)** — thumbnails in a **vertical strip on the far left** at `lg` (`w-20 shrink-0
  flex-col gap-2`), horizontal underneath the main image below `lg`. Main image `aspect-square
  rounded-card border border-border`, `object-contain`, with overlaid `chevronLeft`/`chevronRight`
  circular buttons at mid-height when `images.length > 1`. Active thumb `border-2 border-primary`.
  Keep the existing `activeImg` state.
- **Info column (right)**, in this order:
  1. `SKU: {sku}` — `text-label-xs text-ink-muted`
  2. `<h1>` — **`text-headline-sm font-display font-bold`** (deliberately restrained, per Walmart)
  3. `Sold by {brand?.name ?? 'Tools Jamaica'}`
  4. `<Stars rating count />` + a `#reviews`-style anchor only if `reviewCount > 0`
  5. **Price** — `text-display-md font-bold text-accent` + the existing in-stock/out-of-stock `Badge`
  6. `shortDescription`
  7. **Highlights** — keep the existing orange-check list
  8. **Buy box** — a bordered panel (`rounded-card border border-border p-4 shadow-card`):
     `<h3 className="text-headline-sm">Get this product</h3>`, then:
     - a **quantity stepper** — `[−] [n] [+]`, `h-10`, clamped to `1..max(1, stock)`, disabled when out
       of stock. *(Walmart has no stepper on its PDP; we deviate deliberately because we have a real
       cart and hardware is bought in multiples.)*
     - a **full-width primary CTA `Add to cart`** → `add(product, qty)` then `open()` the drawer.
       Disabled + label `Out of stock` when `stock <= 0`.
     - a secondary outline `Enquire on WhatsApp` button (product name + SKU prefilled) and a
       `Call {PHONE_DISPLAY}` link. **No payment buttons.**
     *(Part A ships this without the stepper and with WhatsApp as the primary; Step 12 promotes
     Add to cart to primary.)*
  9. **Trust strip** — 3 small icon+label rows (delivery, genuine brands, expert advice).
- **Sticky mini buy-bar** — appears once the buy box scrolls out of view (`IntersectionObserver` on a
  ref): `fixed inset-x-0 bottom-0 z-30 lg:top-16 lg:bottom-auto` bar with `bg-surface border-t
  border-border shadow-pop` holding a 40px thumb, the truncated name, the price, and the **same primary
  CTA as the buy box** (`Add to cart` once Step 12 lands).
  On mobile it sits at the **bottom**; on desktop pin it under the header. Hide it when the
  `WhatsAppButton` FAB would overlap — give the FAB `bottom-24` while the bar is visible, or simply
  hide the FAB on this page while the bar shows.
- **Tabbed panel** — replace the side-by-side Description/Specs with a **centered tabbed card**
  (`mx-auto max-w-4xl rounded-card border border-border bg-surface p-6`): tabs `Description | Specifications`
  centered above the body. Local `useState` tab; keep the existing zebra-striped specs `<table>` inside
  the Specifications tab.
- **Related rail** — swap the 4-col grid for `<Rail title="Recommended products" />`.

---

## Step 8 — Footer

Rewrite **`apps/web/src/components/Footer.tsx`** into Walmart's structure, same colours:

- **Contact band** (replaces Walmart's newsletter — we have no email backend, so **do not build a
  newsletter form**): `bg-surface-muted`, right-aligned copy "Questions? We reply on WhatsApp." + a
  `WhatsApp us` orange button and a `tel:` link.
- **Link grid** — `bg-primary text-primary-fg`, `grid grid-cols-2 gap-8 py-12 md:grid-cols-3
  lg:grid-cols-6`. Six columns: **Shop** (All products / Featured / In stock), **Departments**
  (top 4–5 from `api.categories()`, live), **Company**, **Help**, **Contact** (phone, WhatsApp,
  hours — real links), **Admin**.
  **Remove the inert `<span className="cursor-default">` dead links** — either link them somewhere real
  or drop the item entirely. Do not ship placeholder non-links.
- Keep the `border-t-4 border-accent` top edge and the copyright bar.
- Keep `WhatsAppButton` as-is except for the PDP overlap fix noted in Step 7.

---

---

# Part B — Cart, checkout & orders

**Decided with the user:** guest cart in `localStorage` (no customer login), checkout writes a real
order to Postgres, admin gets an Orders screen. **No payment integration.**

**Non-negotiables for this part:**

- **The server owns pricing.** The checkout request sends `{ productId, quantity }[]` and customer
  details — **never a price, never a total**. The API re-reads each product, snapshots the server-side
  price via the existing `resolvePrice()` seam in `apps/api/src/lib/pricing.ts`, and computes the
  totals itself. A client-supplied price must be impossible to submit, not merely ignored.
- **Order lines are snapshots.** `order_items` copies name/sku/price/image at order time so an order
  reads correctly years later even if the product is renamed, repriced, or deleted.
- **No stock decrement.** Phase 1 has no inventory reservation. Submitting an order does not change
  `products.stock`. Do not add a decrement, and do not add a `reserved` column.

---

## Step 9 — Migration `0006_orders.sql` (write the file; the USER runs it)

Create `apps/api/supabase/migrations/0006_orders.sql`. **Do not execute SQL from code and do not use
any Supabase MCP tool to apply it** — write the file, then tell the user to run it by hand in the
Supabase SQL Editor after `0005`. Match the house style of the existing migrations: a `-- ====` banner
comment explaining *why*, and re-runnable (`if not exists` / drop-then-create).

Contents:

1. **Status enum** — `order_status` as `('new', 'confirmed', 'fulfilled', 'cancelled')`, created inside
   a `do $$ ... exception when duplicate_object then null; end $$;` guard, exactly like
   `public.user_role` in `0001_init.sql`.
2. **Human-readable order numbers** — `create sequence if not exists public.order_number_seq;` and
   default the column to `'TJ-' || lpad(nextval('public.order_number_seq')::text, 6, '0')`.
   Customers quote "TJ-000123" on WhatsApp; a raw UUID is useless on the phone.
3. **`public.orders`** — `id uuid pk default gen_random_uuid()`, `order_number text not null unique`
   (default above), `customer_name text not null`, `customer_phone text not null`,
   `customer_email text`, `fulfillment text not null check (fulfillment in ('pickup','delivery'))`,
   `delivery_address text`, `notes text`, `subtotal numeric(12,2) not null check (subtotal >= 0)`,
   `currency text not null default 'JMD' check (currency = 'JMD')`,
   `status public.order_status not null default 'new'`, `created_at`/`updated_at timestamptz not null
   default now()`. Index on `(created_at desc)` and on `(status)`.
4. **`public.order_items`** — `id uuid pk`, `order_id uuid not null references public.orders(id) on
   delete cascade`, `product_id uuid references public.products(id) on delete set null`
   (**set null, not cascade** — deleting a product must never erase order history),
   snapshot columns `product_name text not null`, `product_sku text`, `product_slug text`,
   `image_url text`, `unit_price numeric(12,2) not null`, `quantity integer not null check (quantity >
   0 and quantity <= 999)`, `line_total numeric(12,2) not null`. Index on `(order_id)`.
5. **`updated_at` trigger** — reuse the existing shared trigger function from `0001_init.sql`
   (grep it for `updated_at` / `set_updated_at` and attach the same one to `orders`; only define a new
   function if none exists).
6. **RLS** — `alter table ... enable row level security` on both tables and **create no policies at
   all**. Deny-by-default is exactly right here: orders contain customer names, phones and addresses,
   and only the service-role API should ever read them. Add a comment saying so, matching the tone of
   `0002_rls.sql`.
7. **Grants** — explicitly **do not** grant `anon`/`authenticated` anything on these tables (the
   catalog grants in `0003_grants.sql` are select-only on catalog tables; orders get nothing).

---

## Step 10 — Shared DTOs + API module

### `packages/shared/src/index.ts` (append; shared is consumed from source, no rebuild)

```ts
export type OrderStatus = 'new' | 'confirmed' | 'fulfilled' | 'cancelled';
export type Fulfillment = 'pickup' | 'delivery';

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

/** What the browser is allowed to send. Note: no prices, no totals. */
export interface CreateOrderRequest {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  fulfillment: Fulfillment;
  deliveryAddress?: string;
  notes?: string;
  items: { productId: string; quantity: number }[];
}
```

Also add the `orders` row types to `apps/api/src/types/db.ts`, mirroring the existing row-type style.

### New module `apps/api/src/modules/orders/{routes,schema,service,mappers}.ts`

Copy the shape of `modules/catalog/` exactly: thin handlers, `ah()` wrapper, zod in `schema.ts`,
logic in `service.ts`, row→DTO in `mappers.ts`.

- **`schema.ts`** — `createOrderSchema`: `customerName` 2–120 chars trimmed; `customerPhone` 7–20 chars
  matching a permissive `/^[\d\s+()-]+$/`; `customerEmail` optional `.email()`; `fulfillment` enum;
  `deliveryAddress` optional, **required when `fulfillment === 'delivery'`** (enforce with
  `.superRefine()`); `notes` optional max 1000; `items` a non-empty array (max 50) of
  `{ productId: z.string().uuid(), quantity: z.number().int().min(1).max(999) }`.
- **`service.ts` → `createOrder(input)`**:
  1. Dedupe `items` by `productId`, summing quantities.
  2. One `db.from('products').select(...).in('id', ids)` — no N+1.
  3. `AppError.BadRequest` if any id is missing or `is_published === false`
     (code in `details` so the cart can name the item).
  4. `AppError.Conflict('Some items are no longer available', { items: [...] })` for anything with
     `stock <= 0`. Insufficient-but-nonzero stock is **allowed** (the shop confirms by phone).
  5. Price each line with `resolvePrice(product, null)`; `lineTotal = unitPrice * quantity`;
     `subtotal = sum(lineTotal)`, rounded to 2 dp.
  6. Insert the order, then the items, then re-select and return the full `OrderDTO`.
     Supabase has no client transaction — insert the order first and, if the items insert fails,
     delete the just-created order before rethrowing, so no headless order is left behind.
  7. `logger.info({ orderNumber, subtotal, itemCount }, 'order created')`.
- **`routes.ts`** — `POST /` only, mounted with a new `orderRateLimit` (see below) and
  `validate({ body: createOrderSchema })`, responding `201` with the `OrderDTO`.
  **There is deliberately no public `GET /orders/:id`** — order numbers are sequential and guessable,
  so a public lookup would leak customer names, phones and addresses. Do not add one.

### Wiring

- `apps/api/src/routes.ts` — `router.use('/orders', ordersRouter());`
- `apps/api/src/middleware/rateLimit.ts` — add `orderRateLimit`: `windowMs: 60 * 60 * 1000`,
  `limit: isTest ? 1000 : 10`, same envelope as the others, with a comment noting an unauthenticated
  write endpoint needs a tighter limit than browsing.
- `apps/api/src/app.ts` — **add `'/api/v1/orders'` to `CSRF_EXEMPT`.** Reason to put in the comment:
  the `sw_csrf` cookie is only ever issued by `setSession()` on login/refresh, so a guest shopper never
  has one; and CSRF exists to stop an attacker riding a victim's ambient session, which a guest order
  has none of. The rate limit above is the real control here. Keep the exemption list's existing
  comment style.

---

## Step 11 — CartContext + CartDrawer

### `apps/web/src/context/CartContext.tsx`

Model it on the existing `AuthContext.tsx` (same provider/hook/`createContext` shape).

```ts
export interface CartLine {
  productId: string; slug: string; name: string;
  sku: string | null; imageUrl: string | null;
  price: number; currency: Currency; stock: number; quantity: number;
}
```

Exposes `{ lines, count, subtotal, add(product: ProductSummaryDTO, qty?: number), setQty(productId,
qty), remove(productId), clear(), isOpen, open(), close() }`.

- `count` = sum of quantities; `subtotal` = `Σ price × quantity` — both `useMemo`.
- `add` merges into an existing line by `productId` (clamping to `1..999`), it does not duplicate.
- **Persistence:** key `tj_cart_v1` in `localStorage`. Hydrate once on mount inside `try/catch`, and
  **validate the parsed shape** — it must be an array whose entries have a string `productId` and a
  finite numeric `quantity`; drop anything malformed rather than trusting it. Write on every change.
  Guard every access with `typeof window !== 'undefined'`.
- **Stale prices:** localStorage prices are a display convenience only. Put a comment on the type
  saying the server re-prices at checkout, and show the server's `subtotal` from the 201 response on
  the confirmation screen if it differs from the client's.
- Wrap `<App/>` in `main.tsx`: `<AuthProvider><CartProvider>…</CartProvider></AuthProvider>`.

### `apps/web/src/components/CartDrawer.tsx`

`Drawer side="right" title="Your cart"` (the Step 2 primitive), rendered once in `PublicLayout` and
driven by `isOpen`/`close()`.

- Line rows: 64px `ImageWithFallback` thumb, name (2-line clamp, links to the PDP and closes the
  drawer), unit price, a compact `[−] n [+]` stepper, a `close`-icon remove button, and the line total.
- Sticky footer: `Subtotal` + `formatPrice(subtotal)`, a muted "Delivery quoted separately" line, then
  a full-width primary **`Checkout`** button (`/checkout`) and a `View cart` outline link (`/cart`).
- Empty state: cart icon + "Your cart is empty" + a `Shop products` button. No Loader.
- Close the drawer on route change.
- **`WhatsAppButton` overlap:** it is `fixed bottom-right z-50` — give the FAB `z-40` or hide it while
  the drawer is open so it does not float over the drawer.

---

## Step 12 — Wire the CTAs

- **`ProductCard.tsx`** — switch to the "Add" variant described in Step 4 item 3.
- **`ProductDetailPage.tsx`** — switch the buy box to the stepper + `Add to cart` primary variant
  described in Step 7, and make the sticky mini buy-bar's CTA match.
- **`Header.tsx`** — enable the cart button + count bubble from Step 3 item 4.
- Optional nicety, only if cheap: after `add()`, the drawer opening *is* the confirmation. Do not build
  a toast system for this.

---

## Step 13 — Cart, checkout and confirmation pages

Add to the route table in `apps/web/src/App.tsx`, all inside `PublicLayout`:
`/cart`, `/checkout`, `/order/:orderNumber`.

**`pages/CartPage.tsx`** — `Breadcrumbs`, then `grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]`:
line items on the left (same row anatomy as the drawer, roomier; a `ConfirmDialog` on "Clear cart" per
the CLAUDE.md rule), and a sticky **order summary** card on the right (`rounded-card border
border-border p-4 shadow-card`) with subtotal, the delivery note, and a full-width `Proceed to
checkout` button. Empty state mirrors the drawer's.

**`pages/CheckoutPage.tsx`** — redirect to `/cart` if `lines.length === 0`.
Two columns (`lg:grid-cols-[1fr_360px]`): the form left, a read-only order summary right.

- Fields, using the `Input` primitive and the shared `Select` (**never a native `<select>`**):
  `Full name*`, `Phone*`, `Email` (optional), `Fulfillment` (`Select`: Pickup / Delivery),
  `Delivery address` (**shown and required only when Delivery**), `Notes` (textarea, optional).
- Client-side validation mirroring the zod schema, with inline `text-error` messages under each field.
- Submit → `api.createOrder({ ...form, items: lines.map(l => ({ productId: l.productId, quantity:
  l.quantity })) })`. **Send no prices.** Disable the button and swap its label while in flight.
- On success: `clear()`, then `navigate('/order/' + order.orderNumber, { state: { order }, replace:
  true })`.
- On `ApiError`: render the message in an `error`-toned panel above the form; if the code indicates
  unavailable items, list them by name and offer a `Back to cart` link. Do **not** clear the cart on
  failure.

**`pages/OrderConfirmationPage.tsx`** — reads the `OrderDTO` from `location.state`. Big check icon,
`Order TJ-000123 received`, the item list and server subtotal, what happens next ("We'll call or
WhatsApp you to confirm availability and arrange payment"), a **`Send us this order on WhatsApp`**
button prefilled with the order number via `whatsappUrl(...)`, and a `Continue shopping` link.
If `location.state` is absent (someone deep-linked or refreshed), show a friendly fallback pointing at
WhatsApp with the number from the URL — **do not fetch the order**, there is no public endpoint.

---

## Step 14 — Admin Orders

### API — extend the existing `apps/api/src/modules/admin/` files

Add an "Orders" section to `routes.ts` / `schema.ts` / `service.ts` / `mappers.ts` alongside the
existing Products / Categories / Brands sections (do not create a parallel module). Already gated by
`requireAuth, requireRole('admin')` and the global CSRF guard.

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/orders` | Paginated `{ items, total, page, pageSize }`, newest first. Query: `status?`, `q?` (matches `order_number` / `customer_name` / `customer_phone`, ilike), `page`, `pageSize`. |
| GET | `/admin/orders/:id` | Full order incl. items. |
| PATCH | `/admin/orders/:id` | **Status only** — body `{ status: OrderStatus }`. Nothing else about an order is editable. |

Return `AppError.NotFound` for a missing id. List rows may omit `items` for speed — if so, give the
list its own summary type with an `itemCount` rather than lying about the DTO shape.

### Web

- `apps/web/src/lib/api.ts` — add `createOrder(body: CreateOrderRequest): Promise<OrderDTO>`,
  `adminOrders(q)`, `adminOrder(id)`, `updateOrderStatus(id, status)`, following the existing method
  style (the wrapper already handles CSRF headers and the 401→refresh→replay).
- `pages/admin/AdminOrdersPage.tsx` at `/admin/orders` — table: order number, date, customer name +
  phone, item count, subtotal, status `Badge` (`new` → `accent`, `confirmed` → `navy`, `fulfilled` →
  `success`, `cancelled` → `neutral`). A status filter (shared `Select`) + a search box, both
  URL-synced with `useSearchParams` like `ShopPage`. Reuse the Step 6 `Pagination` primitive. `Loader`
  while loading; a dashed-border empty state.
- `pages/admin/AdminOrderDetailPage.tsx` at `/admin/orders/:id` — customer block (name, phone as a
  `tel:` link, email, fulfillment + address, notes), the line-item table with the snapshot values, the
  subtotal, a status `Select` that PATCHes on change, and a `WhatsApp customer` button built from the
  order's phone. Cancelling goes through `ConfirmDialog` (`danger`).
- `components/admin/AdminLayout.tsx` — add `<NavLink to="/admin/orders">Orders</NavLink>` **first** in
  the nav, above Products; it is the daily-driver screen. Register both routes in `App.tsx` under
  `AdminLayout`.

### Tests — `apps/api/test/`

Follow the existing hermetic pattern (Supabase mocked at the module boundary):

1. `POST /api/v1/orders` with a valid body → 201, and the persisted subtotal equals the **server**
   price × qty even when the request tries to smuggle a `price`/`subtotal` field.
2. Unpublished or unknown `productId` → 400; `stock <= 0` → 409.
3. `fulfillment: 'delivery'` with no address → 400.
4. `GET /api/v1/admin/orders` without an admin session → 401/403 (mirror the existing admin
   role-gating test).

---

## Step 15 — OPTIONAL, ask the user before starting

Two Walmart features are impossible with the current data model. **Do not build these unless the user
explicitly asks** — each needs a shared-type change, a mapper change, and a hand-run SQL migration
(next file after Step 9's `0006_orders.sql` — i.e. `0007_*.sql` — using `add column if not exists`, run
manually in the Supabase SQL Editor. **Never run SQL from code.**)

1. **Was-price / discount chip** — needs `products.compare_at_price NUMERIC(12,2) NULL`, plus
   `compareAtPrice` in `packages/shared/src/index.ts`, `apps/api/src/types/db.ts`, both catalog and
   admin `mappers.ts`, the admin zod schema, and the `ProductEditorPage` form. Only then can the card
   show a strikethrough price and a `-20%` chip.
2. **"New arrivals" sort** — needs `'newest'` added to the `ProductSort` union in shared, the zod enum
   in `apps/api/src/modules/catalog/schema.ts`, and an `order('created_at', { ascending: false })`
   branch in `catalog/service.ts`.

Also out of scope by design: online payment, wishlist/"Mis listas", customer accounts and order
history, reviews submission, store-locator, and a nested department mega-menu (`CategoryDTO` has no
`parentId`).

---

# Verification

Run after **every** step:

```bash
npm run typecheck && npm run lint
```

Then, once Steps 1–8 are done, verify in the browser rather than asking the user to check:

1. Start the dev server with the Browser-pane tool (`preview_start` with `.claude/launch.json` name —
   create the config if absent: `npm` / `["run","dev"]` / port `5173`). **Never** run the dev server
   through Bash.
2. `read_console_messages` and `preview_logs` — zero errors.
3. Walk `/`, `/shop`, `/shop?q=drill`, `/shop?category=<a real slug>`, `/product/<a real slug>`, and a
   bad slug (404). Use `read_page` to confirm structure and `computer` to click through.
4. Interaction checks: header search submits to `/shop?q=…`; hamburger opens the department drawer and
   a department link filters the shop; a category chip toggles the URL param; sort changes the URL and
   the grid; the numbered pager moves pages and survives a reload (URL is the source of truth);
   filters round-trip through the URL.
5. `resize_window` to **mobile (375)**, **tablet (768)**, and **desktop (1440)** on `/shop` and a PDP.
   Confirm: mobile shows the search row + 2-up grid + `[Sort][Filters]` pills; the filter drawer opens,
   scrolls, and its sticky Clear/Apply bar works; **no horizontal page scroll at any width** (check
   `document.documentElement.scrollWidth === clientWidth` via `javascript_tool`); the PDP sticky
   mini-bar appears on scroll and does not collide with the WhatsApp FAB.
6. Confirm the palette is untouched:
   ```bash
   git diff --stat apps/web/src/styles/tokens.css && git diff apps/web/src/styles/tokens.css
   ```
   The only additions may be `--shadow-card` and `--container-max`. **No colour line may differ.**
   Also `grep -rnE '#[0-9a-fA-F]{6}' apps/web/src --include=*.tsx` must return nothing new.
7. `npm test` — the existing api suite plus the new orders tests from Step 14. All green.
8. Screenshot `/`, `/shop`, and a PDP at desktop and mobile and share them with the user.

## Part B — cart & order flow

The migration must be run by the user first. **Stop and tell them** once `0006_orders.sql` is written:
they run it by hand in the Supabase SQL Editor. Nothing in Part B works until they confirm.

9. Add a product from a card → the drawer opens with the right line, and the header bubble shows 1.
   Add the same product again → quantity becomes 2, **not** two separate lines. Add from the PDP with
   qty 3 → the line reads 5.
10. Reload the page → the cart survives (localStorage). Then run
    `localStorage.setItem('tj_cart_v1', '{"junk":true}')` via `javascript_tool`, reload, and confirm the
    app does **not** crash — the malformed value is dropped and the cart is empty.
11. Steppers and remove work in both the drawer and `/cart`; "Clear cart" goes through `ConfirmDialog`;
    the empty state renders. `/checkout` with an empty cart redirects to `/cart`.
12. Checkout: switching Fulfillment to **Delivery** reveals a required address field; submitting with it
    blank shows an inline error and no request fires (`read_network_requests`).
13. Submit a valid order → `read_network_requests` shows `POST /api/v1/orders` → **201** and, critically,
    the **request payload contains no price or subtotal**. The confirmation page shows a `TJ-` number and
    the cart is now empty.
14. **Server-authority check** — replay the create with a tampered body (via `javascript_tool` fetch,
    adding `price`/`subtotal` fields and a wrong quantity type): prices must be ignored/rejected and the
    stored subtotal must match the catalog price × quantity. Also submit an unknown `productId` → 400.
15. Log into `/admin`, open **Orders** → the order is listed as `new`. Open it, change status to
    `confirmed` → the badge updates and survives a reload. The `tel:` and WhatsApp links carry the
    customer's number.
16. Confirm the CSRF exemption is scoped: `POST /api/v1/orders` succeeds without an `x-csrf-token`
    header, while `POST /api/v1/admin/orders/<id>` (or any admin mutation) without one still fails.
17. Confirm no stock was decremented — the product's stock is unchanged after ordering.
