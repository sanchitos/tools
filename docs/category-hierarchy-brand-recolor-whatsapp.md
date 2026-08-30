# Plan — Category hierarchy, brand recolor, WhatsApp-only contact

## Context

Three related storefront changes for Tools Jamaica:

1. **Category + subcategory taxonomy.** The catalog is currently a **flat, single-level** category model (`categories` table, no `parent_id`). The client needs a real two-level taxonomy (parents with subcategories) matching their product departments. Selecting a parent must include its subcategories' products (confirmed), and a product may be assigned to **either** a parent or a subcategory (confirmed).
2. **Brand recolor.** Swap the "Industrial Integrity" Drill-Navy/Safety-Orange palette for the client's real brand colors — **blue `#282d53`, red `#df2a2f`, yellow `#efe013`**. Their live site (toolsja.com) uses blue as the structural brand color, red as the accent (rules, search, CTAs), yellow as the pop → **blue = primary, red = accent, yellow = highlight**.
3. **WhatsApp-only contact.** The phone number takes WhatsApp only, not calls. Remove every `tel:` link / "Call us" affordance; keep the number visible where useful but route all contact CTAs to WhatsApp.

The token layer is centralized (`apps/web/src/styles/tokens.css` → `tailwind.config.js`), so the recolor is mostly one file. Categories are the real work: schema migration + query changes + admin/shop UI.

---

## Part 1 — Brand recolor (blue / red / yellow)

Palette is fully token-driven; components never hard-code brand hex. Only two hard-coded spots exist outside the token file (found via exploration): `index.html` `theme-color` and the WhatsApp green.

**Files:**
- `apps/web/src/styles/tokens.css` — update the **semantic** tokens (each restates a hex; not `var()`-chained):
  - `--color-primary` `#014b7a` → `#282d53`; `--color-primary-dark` `#003457` → `#1b1f3b` (darker indigo for hovers/utility bar).
  - `--color-accent` `#f28c00` → `#df2a2f`; `--color-accent-hover` `#d97e00` → `#c31f24`.
  - `--color-ring` `#014b7a` → `#282d53`.
  - `--color-inverse-surface` `#213145` → `#171a33` (deep brand indigo — hero overlay + footer + admin sidebar follow this).
  - **Add** `--color-highlight: #efe013;` and `--color-highlight-fg: #1b1f3b;` (dark text on yellow for contrast).
  - Update the raw reference block (`--drill-navy`, `--safety-orange`, …) to the new brand names/values for accuracy (cosmetic; nothing consumes them).
  - Leave the neutral surfaces (`#f8f9ff`, `#eff4ff`, `#e5eeff`) and feedback colors; keep `--color-error` (`#d62118`) — close to accent red but only used in error contexts.
- `apps/web/tailwind.config.js` — add a `highlight` color mapping (`highlight` + `highlight.fg`) alongside the existing semantic colors.
- `apps/web/index.html` — `<meta name="theme-color" content="#014b7a">` → `#282d53`.
- **Apply yellow (`highlight`) sparingly** for pop: the "Sale" chip/badge and any discount tag (e.g. in `ProductCard.tsx`). Everything else re-colors automatically via tokens.
- **Leave** `WhatsAppButton.tsx` `bg-[#25D366]` — that's WhatsApp brand green, not ours.

Because primary→blue and accent→orange→red propagate through `bg-primary`, `text-accent`, price tags, badges, active nav, admin sidebar, hero/footer, no per-component edits are needed beyond the optional yellow accents.

---

## Part 2 — WhatsApp-only contact

Remove all callable affordances; keep WhatsApp. Number stays visible but points at WhatsApp (no `tel:`).

**Files:**
- `apps/web/src/lib/contact.ts` — drop `PHONE_TEL` (and its uses); keep `PHONE_DISPLAY` (for display), `WHATSAPP_URL`, `whatsappUrl()`.
- `apps/web/src/components/Header.tsx` — remove the two `tel:` links (utility-bar "Call us: …" and nav "Call us"); the existing WhatsApp nav link + tagline link stay. Utility bar keeps a WhatsApp contact link showing the number.
- `apps/web/src/components/Footer.tsx` — convert the bordered phone button (contact band) to a WhatsApp link labeled with the number; remove the Help-column "Call us" `tel:` item (the "WhatsApp us" item stays).
- `apps/web/src/pages/ProductDetailPage.tsx` — remove the "Call {number}" `tel:` link under the buy box (the "Enquire on WhatsApp" CTA above it stays).
- Clean up now-unused imports (`PHONE_TEL`, and `PHONE_DISPLAY` where a spot is fully removed).
- **Leave** `apps/web/src/pages/admin/AdminOrderDetailPage.tsx` `tel:${order.customerPhone}` — that's an admin calling a *customer* about an order, not the storefront contact number.

---

## Part 3 — Category + subcategory hierarchy

### 3a. Schema (two new migrations — user runs them in the Supabase SQL Editor)

Latest migration is `0006_orders.sql`. Add:

- **`apps/api/supabase/migrations/0007_category_hierarchy.sql`**
  - `alter table public.categories add column if not exists parent_id uuid references public.categories(id) on delete restrict;`
  - `create index if not exists idx_categories_parent on public.categories(parent_id);`
  - self-parent guard: `add constraint categories_no_self_parent check (parent_id is null or parent_id <> id)` (idempotent-guarded). Two-level depth is enforced in the API.
  - `on delete restrict` means deleting a parent that still has subcategories raises `23503`, reusing the existing admin 409 path.
- **`apps/api/supabase/migrations/0008_category_taxonomy.sql`** (data, idempotent — `on conflict (slug) do nothing`, child `parent_id` via subselect on parent slug):
  - **Exact taxonomy** (`slug` → `label`; children listed under parents). Reuses existing `tiles`/`faucets`/`doors` rows as parents (conflict-safe); adds subs:

    | Parent (slug → label) | Subcategories (slug → label) |
    |---|---|
    | `tiles` → Tiles *(existing)* | `ceramic` → Ceramic · `porcelain` → Porcelain |
    | `countertops` → Countertops | `porcelain-slabs` → Porcelain Slabs · `granite` → Granite · `sintered-stone` → Sintered Stone |
    | `faucets` → Faucets *(existing)* | `kitchen-faucet` → Kitchen Faucets · `bathroom-faucet` → Bathroom Faucets |
    | `paint` → Paint | `exterior-paint` → Exterior Paint · `interior-paint` → Interior Paint |
    | `doors` → Doors *(existing)* | `interior-doors` → Interior Doors · `exterior-doors` → Exterior Doors · `security-doors` → Security Doors |
    | `toilets` → Toilets | — |
    | `mosaics` → Mosaics | — |
    | `bath-tubs` → Bath Tubs | — |
    | `basin` → Basin | — |
    | `sinks` → Sinks | — |
    | `vanities` → Vanities | — |
    | `shower-doors-enclosure` → Shower Doors & Enclosures | — |
    | `shower-faucet` → Shower Faucets | — |
    | `locks` → Locks | — |
    | `grouts` → Grouts | — |
    | `thinset` → Thinset | — |

  - `sort_order`: assign in the order above (parents by 10s: 10, 20, …); children by 1s within their parent.

> **Assumption (flag on review):** additive. Existing extra demo categories (`flooring`, `kitchen`, `sanitary-ware`, `windows`, `sale`) are left in place — you can hide/delete them in the admin (deletion is blocked by 409 while demo products reference them). Tell me if you'd rather I remove/replace them.

### 3b. API — filter expansion so a parent includes its children

Keep the `search_products` RPC (`0005_search.sql`) **unchanged** by expanding parent→child slugs in the service layer before both query paths.

- `packages/shared/src/index.ts` — add `parentId: string | null` to `CategoryDTO` (so `AdminCategoryDTO` inherits it); optionally `parentSlug`/`parentLabel` for admin display grouping.
- `apps/api/src/types/db.ts` — add `parent_id: string | null` to `CategoryRow`.
- `apps/api/src/modules/catalog/service.ts`:
  - Add `expandCategorySlugs(slugs)` — returns the requested slugs **plus every child slug** (one query: `slug = any(slugs) or parent_id in (select id from categories where slug = any(slugs))`).
  - `listProductsPlain` — resolve the **expanded** slug set to ids (reuse `idsForSlugs`).
  - `searchProducts` — pass the **expanded** slug array as `p_category_slugs` to the RPC.
  - `listCategories` — include `parentId`; a **parent's `productCount` = own + sum of children's counts** (parent filter includes children). Return the existing flat list shape + `parentId`.
- `apps/api/src/modules/catalog/mappers.ts` — `toCategoryDTO` includes `parentId`.
- `apps/api/src/modules/admin/{schema,service,mappers}.ts`:
  - schema: `categoryCreate/Update` gain `parentId: uuid nullable optional`.
  - service `createCategory`/`updateCategory`: accept `parentId` and enforce **exactly two levels** — reject (400 `BadRequest`) when:
    1. `parentId` does not resolve to an existing category;
    2. the chosen parent is itself a child (`parent.parent_id is not null`) — keeps depth at 2;
    3. `parentId === id` (self-parent; also guarded by the DB check constraint);
    4. the category being edited already **has** children (making it a child would create a 3rd level).
    Products may reference any category (parent or child) — no product-assignment validation (either-or, confirmed). `deleteCategory` 409 message updated to mention subcategories (the `on delete restrict` self-FK raises `23503` when a parent still has children, reusing the existing 409 mapping).
  - `listAdminCategories`: include `parentId`, order by parent grouping then `sort_order`.
  - mapper: `toAdminCategoryDTO` includes `parentId`.

### 3c. Web UI

- `apps/web/src/pages/admin/AdminCategoriesPage.tsx` — `CategoryForm` gains a **Parent** `Select` ("— None (top-level) —" + top-level categories, excluding self and categories that already have children). Table shows hierarchy (subcategories indented under their parent).
- `apps/web/src/pages/admin/ProductEditorPage.tsx` — the category `Select` lists a **hierarchy** (parents, with indented "— Subname" options) so a product can be assigned to a parent or a subcategory.
- `apps/web/src/components/ShopFilters.tsx` — group the flat category list by `parentId`: each top-level category is a selectable group header with its subcategory checkboxes beneath.
- `apps/web/src/pages/ShopPage.tsx` — the chip rail shows **top-level** categories (`parentId === null`); selecting one filters (children included via the API).
- `apps/web/src/pages/HomePage.tsx` — department tiles show **top-level** categories only.
- `apps/web/src/components/DepartmentDrawer.tsx` — render parents with their subcategories (and drop the stale "flat (no parentId)" comment).

### 3d. Tests

- `apps/api/test/catalog.test.ts` (+ `helpers/mockSupabase.ts`, which already supports `queueRpc`) — add a case: filtering `?category=<parent>` expands to child slugs (queue the categories-expansion result + products); assert the plain and RPC paths receive the expanded set. Adjust any `listCategories` test for the new `parentId`/rolled-up counts.

---

## Implementer notes (read first)

- Several files changed recently — **read the current versions before editing** and match existing patterns: `apps/api/src/modules/catalog/service.ts` (has `listProductsPlain` + `searchProducts` + `idsForSlugs`), `apps/api/test/catalog.test.ts` + `apps/api/test/helpers/mockSupabase.ts` (now support `queueRpc`), `apps/web/src/pages/ShopPage.tsx`, `apps/web/src/components/ShopFilters.tsx`, `Footer.tsx`, `Header.tsx`, `ProductCard.tsx`, and `apps/web/src/lib/contact.ts`.
- Reuse existing helpers rather than adding new ones: `idsForSlugs` (catalog service), `ensureUniqueSlug` (admin service), the shared `Select`/`ConfirmDialog`/`Badge` UI primitives, `whatsappUrl()`/`WHATSAPP_URL` (contact).
- **Do not modify** `0005_search.sql` / the `search_products` RPC — parent→child expansion happens in the service layer (`expandCategorySlugs`) so the RPC keeps its exact-slug filter.
- Keep DTO imports in the API as `import type` (erased at build); add the shared `parentId` field in `packages/shared` first, then the mappers and `types/db.ts`.

## Verification

1. **User runs** `0007_category_hierarchy.sql` then `0008_category_taxonomy.sql` in the Supabase SQL Editor.
2. `npm run typecheck && npm run lint && npm test` — all green (adjust catalog tests as above).
3. **DB smoke** (throwaway `tsx` script, service-role, read-only, as used before): confirm `parent_id` exists, the taxonomy is present (parents + subs with correct `parent_id`), and boot the API + `curl "/api/v1/products?category=tiles"` returns products from `ceramic`/`porcelain`; `curl "/api/v1/categories"` shows `parentId` + rolled-up `productCount`.
4. **Browser** (dev servers): 
   - Recolor visible site-wide (blue primary, red accents/price tags, yellow pop); admin sidebar + hero/footer follow.
   - Home departments = top-level only; Shop filters grouped by parent; selecting a parent shows child products; product editor category select is hierarchical; admin categories form has a Parent selector + indented table.
   - No `tel:` links anywhere on the storefront; WhatsApp CTAs work; number still displayed (non-call).
5. Assign a couple of demo products to subcategories in the admin to eyeball parent-includes-children on the Shop page.

## Out of scope / notes
- Migrations are run by hand (per spec); the connected Supabase MCP points at a different project, so I can't run them for you.
- No changes to cart/checkout/orders/search-ranking.
- `docs/` copy of this plan will be written before implementation (CLAUDE.md convention).
