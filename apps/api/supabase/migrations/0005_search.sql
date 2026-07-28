-- ============================================================================
-- 0005_search.sql — full-text + trigram product search
--
-- Fixes the substring-only `q.ilike.%term%` search in catalog/service.ts,
-- which matches the entire query as one literal phrase over just name and
-- short_description ("i need a screwdriver" matches nothing). This adds a
-- weighted, stemmed tsvector plus trigram legs for typos/SKUs/brand/category,
-- ranked in a single RPC that both the storefront search bar and the
-- WhatsApp agent search endpoint call through.
--
-- pg_trgm is already enabled by 0001_init.sql — no new extension here.
-- Run by hand in the Supabase SQL Editor, after 0004. Re-runnable.
-- ============================================================================

-- --- 1. Generated tsvector -------------------------------------------------
-- Drop-then-add (not `add column if not exists`): PG < 17 cannot ALTER a
-- generated column's expression, and this column's weighting will be tuned
-- over time. Trivial rewrite at current table size.
--
-- Two-arg to_tsvector('english', …) is IMMUTABLE and therefore legal in a
-- generated column; the one-arg form is only STABLE (depends on the
-- default_text_search_config GUC) and Postgres will reject it.
--
-- Generated columns cannot reference other tables, so brand name / category
-- label are intentionally NOT in this vector — they are matched via joins in
-- the RPC below instead. That means there is nothing to keep in sync and no
-- way for this column to drift from brands/categories.
alter table public.products drop column if exists search_vector;

alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    -- SKUs are hyphen-split so partial SKU queries ("SIENNA 75") still hit.
    setweight(to_tsvector('english', coalesce(replace(sku, '-', ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored;

create index if not exists idx_products_search_vector
  on public.products using gin (search_vector);

-- 0001_init.sql indexed name + short_description with trgm; sku and the
-- brand/category facet labels were not, and are needed for the word-
-- similarity legs below.
create index if not exists idx_products_sku_trgm
  on public.products using gin (sku gin_trgm_ops);
create index if not exists idx_brands_name_trgm
  on public.brands using gin (name gin_trgm_ops);
create index if not exists idx_categories_label_trgm
  on public.categories using gin (label gin_trgm_ops);


-- --- 2. Ranking RPC --------------------------------------------------------
-- Returns ONLY (id, score, total_count): a pure ranking oracle. Row fetching
-- stays in apps/api/src/modules/catalog/service.ts so resolvePrice() remains
-- the single pricing authority and PRODUCT_SELECT stays the one row shape —
-- this function is never a second source of truth for product data.
--
-- Must DROP first: `create or replace` with a changed signature creates an
-- OVERLOAD rather than replacing it, and PostgREST then returns 300 ("could
-- not choose the best candidate function") the next time the signature is
-- tuned.
drop function if exists public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer);

create function public.search_products(
  p_q              text    default null,
  p_category_slugs text[]  default null,
  p_brand_slugs    text[]  default null,
  p_min_price      numeric default null,   -- numeric, NOT float8: price is numeric(12,2)
  p_max_price      numeric default null,
  p_in_stock       boolean default false,
  p_sort           text    default 'relevance',
  p_limit          integer default 24,
  p_offset         integer default 0
)
returns table (product_id uuid, score real, total_count bigint)
language plpgsql
stable
parallel safe
security invoker                       -- service_role already bypasses RLS;
set search_path = public, pg_temp      -- DEFINER here would leak unpublished rows to anon
as $$
declare
  v_q   text;
  v_tsq tsquery;
begin
  v_q   := nullif(btrim(coalesce(p_q, '')), '');
  -- websearch_to_tsquery never throws on arbitrary user input (unlike
  -- to_tsquery, which throws on bare operators like "AND" or a trailing "&").
  v_tsq := websearch_to_tsquery('english', coalesce(v_q, ''));
  -- An all-stopword query ("do you have any") yields an EMPTY tsquery, and
  -- `@@` with an empty tsquery matches ZERO rows. numnode() guards that so we
  -- fall through to the trigram legs instead of returning nothing.
  if v_tsq is not null and numnode(v_tsq) = 0 then
    v_tsq := null;
  end if;

  return query
  with candidates as (
    -- Each leg is independently index-eligible. A single flat WHERE ... OR ...
    -- spanning the joined brand/category tables would force a seq scan over
    -- products regardless of the indexes above.
    select p.id from public.products p
      where v_tsq is not null and p.search_vector @@ v_tsq
    union
    -- %> is word_similarity, NOT similarity(): similarity('screwdriver',
    -- 'Phillips Screwdriver Set 6-Piece') ~= 0.25, below the 0.3 default
    -- pg_trgm.similarity_threshold, so a similarity() leg would essentially
    -- never fire for "short query inside a long product name". %> asks
    -- whether the query's trigrams appear as a contiguous extent inside the
    -- target and is indexable by gin_trgm_ops.
    select p.id from public.products p
      where v_q is not null and p.name %> v_q
    union
    select p.id from public.products p
      where v_q is not null and p.short_description %> v_q
    union
    select p.id from public.products p
      where v_q is not null and p.sku %> v_q
    union
    select p.id from public.products p
      join public.brands b on b.id = p.brand_id
      where v_q is not null and b.name %> v_q
    union
    select p.id from public.products p
      join public.categories c on c.id = p.category_id
      where v_q is not null and c.label %> v_q
    union all
    select p.id from public.products p
      where v_q is null                                   -- no query: browse mode
  ),
  filtered as (
    select
      p.id, p.price, p.name, p.featured, p.created_at,
      (
        -- Flag 32 normalizes ts_rank_cd to 0..1 so it is commensurable with
        -- word_similarity. Default per-label weights {D,C,B,A} =
        -- {0.1,0.2,0.4,1.0} apply, matching the setweight() calls above.
          case when v_tsq is not null
               then 1.00 * ts_rank_cd(p.search_vector, v_tsq, 32) else 0 end
        + case when v_q is not null
               then 0.35 * greatest(
                      word_similarity(v_q, p.name),
                      word_similarity(v_q, coalesce(p.short_description, ''))) else 0 end
        + case when v_q is not null and upper(p.sku) = upper(v_q) then 5.00 else 0 end
        + case when v_q is not null and p.name ilike v_q || '%'   then 0.50 else 0 end
        + case when v_q is not null and (b.name ilike '%' || v_q || '%'
                                      or c.label ilike '%' || v_q || '%') then 0.25 else 0 end
      )::real as score
    from candidates cand
    join public.products p on p.id = cand.id
    -- LEFT, not INNER: brand_id and category_id are nullable and several
    -- seeded products have brand_id = null. An inner join would silently
    -- drop every brandless product from all search results.
    left join public.brands     b on b.id = p.brand_id
    left join public.categories c on c.id = p.category_id
    where p.is_published
      and (p_in_stock is not true or p.stock > 0)
      and (p_min_price is null or p.price >= p_min_price)
      and (p_max_price is null or p.price <= p_max_price)
      -- Empty array must mean "no filter", not "match nothing" — the caller
      -- may pass '{}' rather than NULL.
      and (p_category_slugs is null or cardinality(p_category_slugs) = 0
           or c.slug = any (p_category_slugs))
      and (p_brand_slugs is null or cardinality(p_brand_slugs) = 0
           or b.slug = any (p_brand_slugs))
  )
  select f.id, f.score, count(*) over () as total_count   -- one pass, no second scan
  from filtered f
  order by
    case when p_sort = 'price-asc'  then f.price    end asc  nulls last,
    case when p_sort = 'price-desc' then f.price    end desc nulls last,
    case when p_sort = 'name'       then f.name     end asc  nulls last,
    case when p_sort = 'featured'   then f.featured end desc nulls last,
    case when p_sort not in ('price-asc','price-desc','name','featured')
         then f.score end desc nulls last,
    f.created_at desc,
    f.id                          -- stable tiebreak: without it, ties (common
                                   -- with price-asc on a small catalog) make
                                   -- pagination non-deterministic and rows
                                   -- duplicate/vanish across pages
  limit  greatest(coalesce(p_limit, 24), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which PostgREST would
-- then expose to anon. The browser never talks to Supabase directly
-- (ARCHITECTURE.md §1) — only the API's service-role client should call this.
revoke all on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer)
  to service_role;
