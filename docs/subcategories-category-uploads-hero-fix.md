# Subcategory tagging, category image uploads, hero image fix

## Context

Three problems reported against the admin back-office:

1. **Subcategories are not separable from main categories when editing a product.** Today
   "subcategory" is not its own concept: it is a self-referential row in `public.categories`
   (`parent_id`, migration `0007`), and a product carries a single FK `products.category_id`
   that may point at *either* a parent or a child. The editor renders one flat dropdown with
   children indented by an em dash (`ProductEditorPage.tsx:135-140`). So a product can have
   exactly one of the two, never a department plus several subcategories.
2. **Category/subcategory images are URL-only.** `AdminCategoriesPage.tsx:185-186` is a bare
   text input, while products, brands, tiles, locations and the hero all upload real files
   through Express → Supabase Storage. There is no `categories` bucket or upload route.
3. **Replacing the homepage hero image throws.** Root cause confirmed: `setHeroImage`
   (`apps/api/src/modules/admin/service.ts:711-729`) writes
   `.upsert({ id: true, image_url }, { onConflict: 'id' })`. Postgres evaluates NOT NULL
   constraints on the *proposed* insert tuple **before** `ON CONFLICT` resolution, and
   `home_hero.headline` is `not null` with no default (`0010_homepage_content.sql:24-39`), so
   the statement raises `23502` **even though the singleton row already exists**. The handler
   rolls back the upload and returns `500 "Failed to save hero image"`. `updateHero` carries
   the same latent trap and only works because the form always sends `headline`.

Outcome: a product gets one **top-level** main category plus **many** subcategories (chosen
from that category's children); categories and subcategories get a real file uploader; hero
image replacement works, and the whole upsert class of bug is removed.

Decisions confirmed with the user: main category select is **top-level only** with a data
backfill; subcategories are restricted to **children of the chosen main category**; the
category "Image URL" text input is **replaced** by the uploader; the subcategory picker is a
**checkbox group** (no new UI primitive).

---

## Part 1 — Product ↔ subcategory many-to-many

### 1a. Migration `apps/api/supabase/migrations/0012_product_subcategories.sql` (run by hand)

Follow the repo's idempotent, heavily-commented style. Four sections:

**§1 Join table** — mirrors the owned-child pattern of `product_specs`
(`0001_init.sql:169-186`):

```sql
create table if not exists public.product_subcategories (
  product_id  uuid not null references public.products (id)   on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (product_id, category_id)
);
create index if not exists idx_product_subcategories_category
  on public.product_subcategories (category_id);
```

- The composite PK already indexes `product_id` first; the extra index serves the
  *reverse* lookup (the storefront filter path, §1c).
- `on delete restrict` on `category_id` is load-bearing: it is what keeps
  `deleteCategory`'s existing `23503 → 409` mapping (`service.ts:543-555`) honest for a
  subcategory that still has tagged products. The 409 copy already reads
  "still has products or subcategories".
- "The joined category must be a child, and a child of this product's own main
  category" is **not** expressible as a `CHECK` (no subqueries). Enforce it in the API
  (§1e), exactly as `0007` already delegates depth to `validateParentId` — and say so
  in the migration comment.

**§2 Backfill** (order matters; both steps are no-ops on a re-run):

```sql
-- Tag first: a product currently pointed at a child keeps that child, as a tag.
insert into public.product_subcategories (product_id, category_id)
select p.id, p.category_id
from public.products p
join public.categories c on c.id = p.category_id
where c.parent_id is not null
on conflict do nothing;

-- Then re-point: its main category becomes that child's parent.
update public.products p
set category_id = c.parent_id
from public.categories c
where c.id = p.category_id and c.parent_id is not null;
```

**§3 RLS + grants** — copy `product_specs` verbatim (`0002_rls.sql:41-58`,
`0003_grants.sql:16-38`): enable RLS, one `for select using (exists (… products p where
p.id = product_subcategories.product_id and p.is_published))` policy, `grant select` to
`anon, authenticated`, explicit `revoke insert, update, delete`.

**§4 `search_products()` — recreate.** The body cannot be patched. The 10-arg signature is
unchanged, so `create or replace function` preserves the EXECUTE grant (unlike `0009`,
which had to DROP); still re-issue the `revoke all … / grant execute … to service_role`
tail defensively, copying `0009_i18n_content.sql:262-275`. Copy the `0009` body
(lines 100-265) with three edits:

- **Category filter** (replaces `0009:236-238`):

  ```sql
  and (p_category_slugs is null or cardinality(p_category_slugs) = 0
       or c.slug = any (p_category_slugs)
       or exists (
            select 1 from public.product_subcategories ps
            join public.categories sc on sc.id = ps.category_id
            where ps.product_id = p.id and sc.slug = any (p_category_slugs)))
  ```

- **New `candidates` trigram leg** (beside `0009:193-196`). Without it, the backfill
  *regresses* free-text search: searching "ceramic" currently matches through
  `c.label %> v_q`, but after the backfill a ceramic tile's main category is "Tiles".

  ```sql
  union
  select p.id from public.products p
    join public.product_subcategories ps on ps.product_id = p.id
    join public.categories sc on sc.id = ps.category_id
    where v_q is not null and (sc.label %> v_q or sc.label_es %> v_q)
  ```

- **Score bonus** — extend the existing `0.25` category-label clause (`0009:221-223`) with
  an `exists (…)` over the same join, so a subcategory-only match doesn't score 0 and sort
  last.

`products.search_vector` is built from product columns only (`0009:58-77`) — no change.

### 1b. Types & DTOs

- `apps/api/src/types/db.ts` — add `ProductSubcategoryRow { product_id; category_id; created_at }`
  beside `ProductSpecRow` (line 82).
- `packages/shared/src/index.ts` — add `subcategoryIds: string[]` to `AdminProductDTO`
  (line 188), documenting "always children of `categoryId`".
- **Public DTOs stay unchanged.** Subcategories affect *filtering*, and nothing on the
  storefront renders them; adding a field nobody reads is dead weight. (Deliberate
  omission — note it in ARCHITECTURE.md.)

### 1c. API — read paths

- `admin/service.ts` `LIST_SELECT`/`DETAIL_SELECT` (lines 73-85): add the to-many embed
  `subcategories:product_subcategories ( category_id )`. Map to `subcategoryIds` in
  `toAdminProductDTO` (`admin/mappers.ts:78-97`). `AdminProductListItem` stays lean — no
  change.
- `catalog/service.ts` `listProductsPlain` (lines 83-86): PostgREST cannot OR across an
  embedded to-many table (`!inner` would drop every untagged product). So resolve the
  tagged product ids first, then OR the two id sets:

  ```ts
  const expanded = await expandCategorySlugs(params.category);
  const ids = await idsForSlugs('categories', expanded);
  const taggedIds = await productIdsForSubcategories(ids);   // new helper, beside idsForSlugs
  query = taggedIds.length
    ? query.or(`category_id.in.(${ids.join(',')}),id.in.(${taggedIds.join(',')})`)
    : query.in('category_id', ids.length ? ids : [NIL_UUID]);
  ```

  Guard the empty case — `id.in.()` is invalid PostgREST. UUIDs contain no commas, so no
  quoting is needed. The id list is bounded by the requested department's product count
  (the "subcategory must belong to the main category" rule means a tagged product's main
  category is always the same parent), so URL length is not a practical risk at this scale;
  note that bound in a comment.
- `expandCategorySlugs` (lines 53-71) is **unchanged** — parent → child-slug expansion is
  still exactly what both legs need.
- Related products (`catalog/service.ts:243-256`) stays `category_id`-based. Widening it to
  prefer a shared subcategory is a separate improvement, not this change.

### 1d. API — category counts

`listCategories` (`catalog/service.ts:262-296`) currently tallies `category_id` then rolls
child counts into the parent. After the backfill that roll-up would report 0 for every
child. Replace with set-based counting so a product tagged with two children of the same
parent is never double-counted:

1. Existing query: published products as `(id, category_id)` → `own: Map<catId, Set<productId>>`
   and a `publishedIds` set.
2. New query: all `product_subcategories` rows, filtered in JS to `publishedIds` →
   `tagged: Map<catId, Set<productId>>`.
3. Per category: `count = |own[c.id] ∪ (c is a parent ? ⋃ tagged[child] ∪ own[child] : tagged[c.id])|`.

The `own[child]` union leg is defensive only (the backfill empties it) and costs nothing.
Same O(products) memory profile as today.

### 1e. API — write path & validation

- `admin/schema.ts`: `subcategoryIds: z.array(uuid).max(20).optional()` on
  `productCreateSchema` (line 44), and inside the `.partial()` block of
  `productUpdateSchema` (line 63).
- New helper in `admin/service.ts`, beside `validateParentId` (line 466):
  `validateTaxonomy(categoryId, subcategoryIds)` — one query loading all referenced
  category rows, then:
  - main category missing or `parent_id !== null` → `AppError.BadRequest('Main category
    must be a top-level category')`;
  - any subcategory missing or `parent_id !== categoryId` → `AppError.BadRequest(...)`
    naming the offender.
- New `replaceProductSubcategories(productId, ids)` mirroring `replaceSpecs`
  (`service.ts:149-163`): delete-all then insert, skipping the insert on an empty array.
- `createProduct` (184-218): validate, insert, then replace — same shape as the existing
  `replaceSpecs`/`replaceHighlights` calls at 216-217.
- `updateProduct` (220-254): validate the **effective** pair. When `subcategoryIds` is
  omitted but `categoryId` is present, load the current rows and **drop** any that are no
  longer children of the new parent rather than 400-ing (that is what a UI would produce
  anyway; the web form always sends both). Keep the `!== undefined` guard so an omitted key
  leaves the join rows untouched.
- `POST /admin/products` / `PATCH /admin/products/:id` in `routes.ts` need no change — zod
  and the service carry it.

### 1f. Web — product editor

`apps/web/src/pages/admin/ProductEditorPage.tsx`:

- `FormState` gains `subcategoryIds: string[]` (line 21 block); `EMPTY` seeds `[]`;
  hydration reads `p.subcategoryIds ?? []` (line 63); the payload sends it (line 91).
- Replace `categoryOptions` (135-140) with top-level only:
  `cats.data.filter(c => c.parentId === null)` — drop the em-dash indent comment.
- Main-category `onChange` prunes `subcategoryIds` to the new parent's children (in
  practice: clears them).
- Under the Category/Brand row (174-176), a full-width **checkbox group** of
  `cats.data.filter(c => c.parentId === form.categoryId)`, using the editor's existing
  checkbox styling (`<input type="checkbox" className="h-4 w-4">`, as used for
  `featured`/`isPublished`). Empty states: "Choose a category first" / "This category has
  no subcategories yet." Do **not** import `ShopFilters`' `Check` — it is local to that
  file (`ShopFilters.tsx:114`), and `ui/*` may not be given an i18n-bound dependency.

### 1g. Ripples

- `ShopFilters.tsx:39-62` and `DepartmentDrawer.tsx` need **no change** — they render the
  flat parent/child list and post slugs; the server resolves membership.
- `AdminCategoriesPage.tsx` list/table: no change (beyond Part 2).
- Seeded taxonomy `0008_category_taxonomy.sql`: untouched; §2 backfill handles its rows.

---

## Part 2 — File upload for category & subcategory images

Subcategories are rows in the same table, so **one** endpoint covers both levels.

### 2a. Migration `0013_category_images.sql`

New bucket, mirroring `0004_storage.sql` and `0010:131-137`:

```sql
insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

drop policy if exists "catalog images are publicly readable" on storage.objects;
create policy "catalog images are publicly readable" on storage.objects
  for select using (bucket_id in
    ('product-images', 'brand-logos', 'site-images', 'category-images'));
```

The policy is recreated wholesale, so **all four** buckets must be listed — omitting one
breaks public reads for it. A distinct bucket (not `site-images/categories`) because
`categories.image_url` is a *single* reference column, which is exactly what makes it safe
to add to the orphan-sweep registry; `site-images` spans three tables and is deliberately
excluded from that sweep.

### 2b. API

- `lib/storage.ts:16-23`: add `CATEGORY_IMAGES_BUCKET = 'category-images'` to the constants
  and the `Bucket` union.
- `admin/service.ts`: `setCategoryImage(id, file)` — copy `setBrandLogo` (631-657) verbatim
  in shape: select current `image_url` → 404 → `uploadObject(CATEGORY_IMAGES_BUCKET, id,
  file)` → `update(...).eq('id', id).select('*').maybeSingle()` → on failure remove the new
  object → on success `removeObjectByUrl` the previous one.
- `deleteCategory` (543-555): after a successful delete, `removeObjectByUrl(
  CATEGORY_IMAGES_BUCKET, previousUrl)` — today it leaves the object behind. Requires
  selecting `image_url` before the delete (as `deleteBrand` does at 608-623).
- `admin/routes.ts`: `POST /categories/:id/image` with `upload.single('file')` +
  `requireImage(req)`, placed after `DELETE /categories/:id` (line 163), mirroring
  `/brands/:id/logo` (205-212).
- `SWEEPS` registry (`service.ts:963`): add
  `{ bucket: CATEGORY_IMAGES_BUCKET, refs: () => refPathsFrom(CATEGORY_IMAGES_BUCKET,
  'categories', 'image_url') }`, and update the registry doc comment. The existing tripwire
  and the dry-run-first admin button both still apply. Seeded external
  `https://toolsja.com/...` URLs resolve to `null` via `pathFromPublicUrl`, so they are
  untouchable by the sweep — correct, and worth a comment.

### 2c. Web

- `lib/api.ts` (beside `uploadBrandLogo`, 268-269):
  `uploadCategoryImage: (id, form) => uploadFile<AdminCategoryDTO>(\`/admin/categories/${id}/image\`, form)`.
- `AdminCategoriesPage.tsx` `CategoryForm`:
  - **Delete the "Image URL" input (185-186) *and* the `imageUrl` key from the submit body
    (line 153).** Leaving the key while removing the field would send `imageUrl: null` on
    every save and wipe the image. Zod has it optional on create and `.partial()` on update,
    so omitting it is correct. Also drop the now-unused `imageUrl` state (126).
  - Render `<ImageUploadField label="Image" url={category.imageUrl} …/>` only when editing
    an existing row; for a new category show "Save the category first, then upload an
    image." — the exact gate `AdminLocationsPage.tsx:198-211` already uses, because the
    endpoint is keyed by row id.
  - `onUpload` builds `FormData`, appends `'file'`, calls `api.uploadCategoryImage`,
    triggers the page reload, returns `updated.imageUrl`.

---

## Part 3 — Hero image fix (+ upload-path hardening)

### 3a. Kill the partial-upsert bug

`admin/service.ts`:

- `setHeroImage` (711-729): replace the blind `upsert` with the existence branch that
  `setTileImage` (792-818) already uses — `select('id, image_url').maybeSingle()`, then
  `update({ image_url }).eq('id', true).select('*').maybeSingle()`. When **no** hero row
  exists, fail with `AppError.BadRequest('Add a hero headline and save it before uploading
  an image')` rather than inventing an empty headline — consistent with `updateHero`'s
  existing guard (696-699).
- `updateHero` (683-708): drop the `upsert` here too — `update().eq('id', true)` when the
  row exists, `insert()` when it does not (the headline guard already covers that branch).
  This removes the whole class of bug rather than the one symptom. Update the function's
  doc comment, which currently sells the upsert as the point.
- Keep `.maybeSingle()` (not `.single()`) on both, matching the tile/location siblings.

### 3b. Make the failure modes legible

Both are directly in the reported "images won't upload" family:

- `middleware/errorHandler.ts`: add a `MulterError` branch → **400** with the real message
  (e.g. "File too large" for the 8 MB limit at `routes.ts:32-35`). Today it falls to the
  generic branch and surfaces as a **500 "Internal server error"** in production.
- `lib/api.ts` `uploadFile` (164-186): route it through the same 401 → `/auth/refresh` →
  replay path `request()` uses (140-147). Today an aged access token makes *every* upload
  fail with a raw 401 while every other admin call self-heals.
- `AdminHomePage.tsx` `HeroForm` (126-139): gate `ImageUploadField` on `hero` being
  non-null (it is rendered unconditionally today), with the same "save first" copy used for
  tiles and locations — otherwise the new 400 is reachable from the UI.

---

## Verification

Order matters: the two migrations must be run before the API code is exercised.

1. **Migrations** — user runs `0012_product_subcategories.sql` then
   `0013_category_images.sql` in the Supabase SQL Editor. Confirm afterwards with a read-only
   query: no product's `category_id` points at a row with a non-null `parent_id`, and
   `product_subcategories` has one row per previously child-assigned product.
2. `npm run typecheck && npm run lint && npm test` at the repo root. Extend
   `apps/api/test/admin.test.ts` (which already covers hierarchy depth at 159-210, using
   the per-table `queueResult` mock) with: product create/update rejecting a non-top-level
   main category and a foreign subcategory; `subcategoryIds` round-tripping on the admin
   DTO; and **`POST /admin/home/hero/image` succeeding against an existing row** — there is
   no test for any upload endpoint today, which is exactly why this bug shipped. That last
   one needs a storage stand-in: `test/helpers/mockSupabase.ts:93` exports `storage: {}`,
   so `uploadObject` would crash. Add `vi.mock('../src/lib/storage.js', …)` at the module
   boundary — the same approach already used for `lib/email.ts` — rather than growing the
   Supabase mock a fake storage client. Extend `apps/api/test/catalog.test.ts` (45-70) for
   the new count logic.
3. `npm run dev`, then in the admin back-office at `:5173/admin`:
   - **Product editor** — main dropdown lists only departments; pick one, check two
     subcategories, save, reload, confirm both persist; switch the main category and confirm
     the checkboxes reset.
   - **Categories** — edit a subcategory, upload a JPEG, confirm the preview and the
     public URL; save the form afterwards and confirm the image is **not** cleared; create a
     new category and confirm the "save first" gate; delete a category with an uploaded
     image and confirm the Storage object is gone.
   - **Homepage** — replace the hero image; it should succeed and the new image appear on
     `/`. Also try a >8 MB file and confirm a clean 400-backed message, not a 500.
4. **Storefront** — `/shop?category=<subcategory-slug>` returns products tagged with it;
   `?category=<parent-slug>` returns the department's products including every tagged one;
   search for a subcategory label (e.g. "ceramic") still finds its products; the Shop filter
   sidebar and Departments drawer show sane counts.
5. **Orphan sweep** — `POST /admin/images/cleanup-orphans?dryRun=true` from the admin
   maintenance button, and confirm the dry-run list contains no live category image and no
   external `toolsja.com`-referenced object.
6. Update `ARCHITECTURE.md` (§5 data model + bilingual notes, §5 Storage bucket list, §6
   admin route table) and `CLAUDE.md` ("Latest migration: `0013_category_images`").
