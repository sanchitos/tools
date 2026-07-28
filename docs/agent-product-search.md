# Live catalog search for the Tools AI agent

## Context

The Tools WhatsApp/social agent already answers product questions — from a **static catalog
pasted into its system prompt** (`n8n/tools/promptgrok.md` lines 170–225: Doors, Tiles,
Bathroom, Paints, … including Screwdrivers and Machetes). That block is manually maintained,
drifts from reality, carries no prices or stock, and is re-sent on every single LLM call.

This replaces it with a live tool call against the Tools Jamaica Supabase catalog.

| | Today | After |
|---|---|---|
| Source | ~55 prompt lines | one tool call |
| Freshness | manual, drifts silently | live |
| Granularity | categories only | real SKUs, sizes, brands |
| Prices/stock | none (prompt line 69 forbids quoting prices) | available |
| Token cost | every turn, forever | only when asked |

**Chosen route:** one ranked search endpoint on the existing Express API, backed by Postgres
full-text + trigram, consumed by both n8n and the storefront search bar.

### Why not the nightly pgvector RAG

- **Freshness is decisive.** A nightly snapshot goes stale on every price/stock edit — the two
  facts the bot exists to report. You'd re-query live anyway, making the vector store a fuzzy
  ID lookup.
- **Filters don't compose with ANN.** `stock > 0`, `price <=`, category are `WHERE` clauses.
  Post-filtering a top-k silently shrinks results: ask for 5, three out of stock, get 2.
- **Embeddings shred hardware identifiers** — `36" x 80"`, `30×60`, `AC4`, `TL-SIENNA-75`.
  Near-identical model numbers collapse to near-identical vectors, returning the *wrong*
  product, which is worse than none.

**The honest counter-argument:** customers write Patois, and `to_tsvector('english', …)` will
never map "sinting fi unclog mi sink" to `Close-Coupled Toilet Suite`. Zero results are
indistinguishable from "we don't stock it."

**But n8n does no keyword extraction — the model fills the tool parameter by tool-calling.** So
the agent normalizes "yo mi need a screwdriva fi mi door dem" → `q: "screwdriver"` *before*
Postgres sees it. The LLM is the semantic layer, it's always fresh, and you already pay for it.
pgvector stays an additive seam (§6).

### Why Express, not n8n or direct Supabase

ARCHITECTURE §1 makes Express the sole gateway; §8 makes `resolvePrice()` the single pricing
authority. Retrieval behind that boundary means n8n never becomes a second source of truth for
price, and one implementation serves the agent *and* the storefront.

### Scope note

The catalog is currently ~8 seed products (doors, faucets, flooring, tiles, sanitary-ware), so
validate with **"doors"** and **"porcelain tile"**, which really exist. Loading the full catalog
is data entry, not code. The zero-result path (§3) is first-class precisely because it will be
common early.

---

## 1. Migration — `apps/api/supabase/migrations/0005_search.sql`

Hand-run in the Supabase SQL Editor per CLAUDE.md. `pg_trgm` is already enabled by `0001_init`.
**No new extension and no new npm dependency anywhere in this plan.**

See the migration file itself for the full, commented SQL (generated `tsvector` column +
trigram indexes on `sku`/`brands.name`/`categories.label`, and the `search_products` ranking
RPC). Non-obvious correctness points, each a real bug if missed:

- Two-arg `to_tsvector('english', …)` is `IMMUTABLE` and legal in a generated column; the
  one-arg form is only `STABLE` and Postgres rejects it.
- `%>` (word_similarity) is used, not `similarity()` — `similarity('screwdriver', 'Phillips
  Screwdriver Set 6-Piece')` ≈ 0.25, under the 0.3 default threshold, so a `similarity()` leg
  would essentially never fire.
- An all-stopword query yields an empty `tsquery`, and `@@` with an empty tsquery matches zero
  rows — guarded with `numnode(tsq) > 0`.
- The match is a `UNION` of independently index-eligible legs, not a flat `WHERE … OR …`
  spanning the joined brand/category tables (which would force a seq scan).
- `LEFT JOIN` brands/categories — `brand_id` is nullable, and an inner join would silently drop
  every brandless product.
- Empty filter arrays are treated as "no filter" explicitly, both in SQL and by passing `null`
  (not `[]`) from TypeScript.
- `DROP FUNCTION IF EXISTS` with the full signature before `CREATE FUNCTION` — `create or
  replace` with a changed signature creates an overload and PostgREST 300s.
- `SECURITY INVOKER` + explicit `REVOKE … FROM PUBLIC` — `CREATE FUNCTION` grants `EXECUTE` to
  `PUBLIC` by default, and `SECURITY DEFINER` here would leak unpublished products to anon.
- `ORDER BY …, f.id` — the id tiebreak prevents non-deterministic pagination on price ties.

After running, confirm the `%>` legs hit the GIN indexes with `EXPLAIN (ANALYZE, BUFFERS)`.

## 2. Shared search service + storefront

`apps/api/src/modules/catalog/service.ts` — when `params.q` is set, calls the RPC, then
re-selects through the existing `PRODUCT_SELECT` with `.in('id', ids)`. Two queries rather than
returning full rows from SQL, deliberately: full rows would mean rebuilding the embedded
`brand`/`category`/`images` as `json_agg` in SQL — untyped, guaranteed to drift from
`mappers.ts`, and bypassing `resolvePrice()`. The RPC is a pure ranking oracle.

Reordering is by **RPC position, not score** — score-sorting would silently override an
explicit `sort=price-asc`, and re-sorting the fetched page in JS would only be sorted
within-page. Explicit user sort always wins; relevance is only the default when the user hasn't
chosen a sort and a search query is present (`packages/shared`'s `ProductSort` gained
`'relevance'`; `catalog/schema.ts` dropped its `.default('featured')` so the service can tell
"chose Featured" from "sent nothing").

`sanitizeSearch()` was deleted — parameterized RPC args and `websearch_to_tsquery` (which never
throws on arbitrary input) make it unnecessary, and it mangled real queries with parentheses.

`ShopPage.tsx` gained a `relevance` sort option (shown only while `q` is non-empty) and a
~300ms debounce on the search input via local state before writing to the URL — previously
every keystroke rewrote the URL, refetched, and flashed the `Loader` (via `useAsync`'s
`loading` flag) on every character.

`/api/v1/products` gained its own rate limiter (`catalogRateLimit`) — it had none, and once `q`
triggers an RPC an unlimited endpoint is a cheap amplification target.

## 3. Agent endpoint

`apps/api/src/modules/agent/` (routes.ts, schema.ts, mappers.ts, service.ts), mounted at
`/api/v1/agent`.

`GET /api/v1/agent/products/search?q=&inStock=&maxPrice=&limit=` → compact `AgentProductDTO`
(`packages/shared`): `{ name, sku, price, currency, inStock, stockCount, brand, category,
shortDescription, url }`, plus top-level `total`, and **when `total` is 0, the published
category list** so the agent has something true to offer instead of inventing a product.

Real token saving: `ProductSummaryDTO` ships `primaryImage` (long CDN URL), `id`, `rating`,
`reviewCount`, `featured` and a nested brand with `logoUrl` — ~350 tokens/product vs ~90 lean,
so ~1,300 wasted tokens per turn at 5 results. `url` comes from the existing `APP_BASE_URL`.

The service delegates entirely to `catalog/service.ts`'s `listProducts()` (same RPC path the
storefront uses) and only reshapes the DTO — so it can never drift from the storefront's
results or bypass `resolvePrice()`.

**Auth** — `apps/api/src/middleware/agentAuth.ts`, `requireAgentKey`: Bearer header (never a
query param — the pino-http `req` serializer in `app.ts` logs the full URL); both sides hashed
to fixed-length digests before `timingSafeEqual` (which throws `RangeError` on a length
mismatch, turning a wrong key into a 500 and leaking key length otherwise); the expected digest
is precomputed once at boot and, if `AGENT_API_KEY` is unset, the route **fails closed** (404s
entirely) rather than opening. `AGENT_API_KEY` is optional in `config/env.ts` — that module
`process.exit(1)`s on validation failure and `test/setup.ts` doesn't set it, so a required var
would break `npm test` and every dev env.

**CSRF** — GET-only genuinely dodges it (`middleware/csrf.ts` short-circuits on `SAFE_METHODS`
before touching cookies). `'/api/v1/agent'` is still listed in `app.ts`'s `CSRF_EXEMPT`
defensively, so a future POST there fails as an agent-auth error, not an untraceable CSRF 403.

**Rate limit** — its own `agentRateLimit` bucket. All n8n traffic arrives from one IP, so
per-IP is effectively global for this route — sized ~120/min, not `authRateLimit`'s 20/15min.

## 4. n8n — `Tools Social Desk.json`

The existing flow is already the right shape: one `AI Agent` (Grok 4.1 fast-reasoning primary +
OpenAI fallback, `needsFallback: true`) with Postgres chat memory, Redis message buffer,
audio/image branches, and a single `CreateLead` tool. No intent router — nothing to restructure.

**Deliverable A — add one node** to a copy of the workflow: `n8n-nodes-base.toolHttpRequest`
named `SearchProducts`, connected `ai_tool` → `AI Agent` (alongside `CreateLead`).
- `GET {APP_BASE_URL}/api/v1/agent/products/search`, `sendQuery: true`
- **Expose only `q`** as model-provided. Every extra model-filled parameter is somewhere the LLM
  hallucinates a value (e.g. `maxPrice: 5000`) that turns a good answer into "we don't have
  that" — the most common `toolHttpRequest` failure mode.
- The **parameter description is the contract** (n8n does no extraction; the model fills it via
  ordinary tool-calling, the same mechanism the existing `CreateLead` node's `$fromAI()` calls
  use):
  > "The product or product type to search for, as a short English noun phrase. Strip greetings,
  > pleasantries and filler. Translate Patois to standard English. E.g. 'yo mi need a screwdriva' → 'screwdriver'."
- Auth via an n8n **Header Auth credential**, not a node parameter — `n8n/` is a git repo and
  the workflow JSON is committed.

**Deliverable B — rewrite `promptgrok.md`**: delete the static catalog block (lines 170–225) and
fold the old "Product Catalog Search & Response Protocol" into a **self-contained
`## Tool: SearchProducts` section**, sitting next to `## Tool: CreateLead` so both tools are
defined in one place with their rules adjacent to their names (better for the model, and no
cross-section indirection to go stale). The zero-result rule is explicit — an LLM handed
`{items: []}` with no instruction *will* invent a product — so it must state plainly that we
don't carry it, offer only the categories the tool returned, and follow the existing
Handling-Unavailable-Products → confirm → `CreateLead` path. The escalation/handoff policy is
unchanged.

Note the original prompt contained a **dangling cross-reference** — it pointed at an
"Unavailable Product Protocol" that never existed under that name (the real section is
"Handling Unavailable Products"). Consolidating removed it; the file now has exactly one
cross-section reference, and it resolves.

Note: **the live prompt is a Supabase row**, not this file — `GetPrompts` calls
`get_company_prompts` with types `["core","evaluator"]` and `PromptSetting` assembles it. The
`.md` is the git copy; updating the row is a manual step.

**Price policy (decided): prices only when asked.** Replace prompt line 69's blanket
*"Never give prices"* with: never volunteer a price or introduce cost into the conversation;
if the customer asks directly, quote the live figure from `SearchProducts` and only that figure.
Never quote a **stock count** — report availability as in-stock / not-in-stock only, since stock
moves faster than price and "you said you had 4" is the worse counter failure. Sale and discount
percentages stay with the branch agent, as today.

**Two unrelated bugs found while reading, worth fixing in the same pass:**
- `CreateLead`'s `inquiry` `$fromAI` description is leftover Spanish from the vehicle template —
  *"Descripción clara del vehículo en el que el cliente mostró interés"* — instructing the model
  to describe a **car**. All five `$fromAI` keys are also auto-generated
  (`fieldValues1_Field_Value`); meaningful names and English descriptions improve extraction.
- `GetPrompts`, `UpdateLeadsToProcessed` and `UpsertHumanPhoneBlock` carry **inline service-role
  Supabase keys**, committed to git and bypassing RLS. Rotating them is out of scope but should
  be done.

## 5. Supporting edits

- `apps/api/src/types/db.ts` — `search_vector?: string` on `ProductRow` (generated column,
  never selected explicitly).
- `packages/shared/src/index.ts` — `sku` moved from `ProductDetailDTO` up onto
  `ProductSummaryDTO` (the mapper already had the data; this lets the agent DTO reuse the
  storefront's summary mapping instead of a second row-level data path), plus the new
  `AgentProductDTO` / `AgentSearchResult`.
- `apps/api/test/helpers/mockSupabase.ts` — added `db.rpc` + `queueRpc()`.
- `apps/api/.env.example` — added `AGENT_API_KEY`.
- `CLAUDE.md` — bumped "Latest migration" to `0005_search`.
- Admin search (`admin/service.ts`) stays substring-only — a deliberate scope boundary, not an
  inconsistency to fix later.

## 6. Phase 3 seam — semantic search (documented, not built)

If zero-result logs (`catalog/service.ts` logs every empty-hit query) show genuine semantic
misses, in increasing cost:
1. A Postgres synonym dictionary (`CREATE TEXT SEARCH DICTIONARY … synonym`) for trade and
   Jamaican vocabulary — config, not architecture.
2. Hand the agent the category taxonomy so it maps "unclog mi sink" → `sanitary-ware`. Free.
3. Only then pgvector, as **one more `UNION` leg in the same RPC**, embedding on write rather
   than nightly so stock and price never go stale.

---

## Verification

- **RPC in the SQL Editor**, against seed data:
  `select * from search_products('i need a door', null, null, null, null, true, 'relevance', 10, 0);`
  — expect ranked rows where the old `ILIKE '%i need a door%'` returned none. Also test an
  all-stopword query ("do you have any"), an exact SKU, a misspelling ("porcelian"), and a
  brandless product.
- **API tests** (`apps/api/test/agent.test.ts`, `agent-disabled.test.ts`, extended
  `catalog.test.ts`) — agent route 401s with no key, 401s on a wrong key, 401s on a
  different-length key, 200s with the right one, 404s when `AGENT_API_KEY` is unset; response
  carries no image/timestamp fields; `GET /products?q=` still paginates; `q` + `price-asc`
  pages without duplicates.
- `npm run typecheck && npm run lint && npm test` — all pass.
- **Storefront**: `/shop`, type "i need a door" — results where there were none, no
  per-keystroke flash.
- **End-to-end**:
  `curl -H "Authorization: Bearer $AGENT_API_KEY" "http://localhost:3000/api/v1/agent/products/search?q=doors&inStock=true"`

## Out of scope

Cart/checkout. Other agent tools (category listing, get-by-SKU, availability check) — search is
the seam they hang off. Rotating the exposed service-role keys.
