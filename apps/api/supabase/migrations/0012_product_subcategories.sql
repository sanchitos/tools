-- ============================================================================
-- 0012_product_subcategories.sql — a product gets ONE department + MANY subcategories
--
-- Before this migration "subcategory" was not its own concept: it is a row in
-- public.categories with a non-null parent_id (0007), and products.category_id
-- pointed at EITHER a parent or a child. So a product could have a department
-- or a subcategory, never a department plus several subcategories — and the
-- admin editor had to render both levels in one flat dropdown.
--
-- After this migration:
--   products.category_id       = the MAIN category, always top-level
--   product_subcategories      = the many-to-many tags, always children of it
--
-- Run by hand in the Supabase SQL Editor, after 0011. Re-runnable.
-- ============================================================================

-- --- 1. The join table -----------------------------------------------------
-- Mirrors the owned-child pattern of product_specs / product_highlights
-- (0001_init.sql): a child table cascading from products, read through a
-- PostgREST embed, rewritten wholesale on save.
--
-- The composite PK gives us the (product_id, ...) index for free — reads always
-- start from a product. The extra index below serves the REVERSE lookup, which
-- is the storefront filter path ("which products carry this subcategory?").
--
-- on delete cascade on product_id: deleting a product drops its tags.
-- on delete restrict on category_id: this is load-bearing. deleteCategory()
-- maps 23503 to a 409 ("Category still has products or subcategories"), so a
-- subcategory that still has tagged products cannot be deleted out from under
-- them. cascade here would silently untag every product instead.
--
-- NOT enforced in the DB: that category_id is a child (parent_id is not null),
-- and that it is a child of THIS product's main category. Neither is expressible
-- in a CHECK — no subqueries — and a trigger would duplicate logic the API
-- already owns. 0007 made the same call for hierarchy depth: the DB guards what
-- it cheaply can, the API owns the rest (see validateTaxonomy() in
-- modules/admin/service.ts).
create table if not exists public.product_subcategories (
  product_id  uuid not null references public.products (id)   on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  created_at  timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index if not exists idx_product_subcategories_category
  on public.product_subcategories (category_id);


-- --- 2. Backfill -----------------------------------------------------------
-- Every product currently pointed at a subcategory keeps that subcategory — as
-- a tag — and its main category becomes that subcategory's parent.
--
-- ORDER MATTERS: tag first, re-point second. The UPDATE is what makes step 1's
-- source rows disappear, so both statements are no-ops on a re-run (nothing
-- points at a child any more) and the pair is idempotent.

insert into public.product_subcategories (product_id, category_id)
select p.id, p.category_id
from public.products p
join public.categories c on c.id = p.category_id
where c.parent_id is not null
on conflict do nothing;

update public.products p
set category_id = c.parent_id
from public.categories c
where c.id = p.category_id
  and c.parent_id is not null;


-- --- 3. RLS + grants -------------------------------------------------------
-- Copies product_specs (0002_rls.sql, 0003_grants.sql): readable by the public
-- roles only when the PARENT PRODUCT is published, no writes at all. The API
-- uses the service-role key and bypasses this, so it is defense-in-depth.
alter table public.product_subcategories enable row level security;

drop policy if exists product_subcategories_select_published on public.product_subcategories;
create policy product_subcategories_select_published on public.product_subcategories
  for select using (
    exists (
      select 1 from public.products p
      where p.id = product_subcategories.product_id and p.is_published
    )
  );

grant select on public.product_subcategories to anon, authenticated;
revoke insert, update, delete on public.product_subcategories from anon, authenticated;


-- --- 4. search_products() — teach it about the join table ------------------
-- A function body cannot be patched, so it is recreated wholesale (as 0009
-- did). The 10-arg signature is UNCHANGED, so `create or replace` keeps the
-- existing EXECUTE grant — unlike 0009, which changed the arg list and had to
-- DROP. The revoke/grant tail is re-issued anyway: it is idempotent, and it
-- keeps this file correct if it is ever run against a project where the
-- function is missing.
--
-- Three changes from the 0009 body, all marked `-- 0012:` below:
--   a) the category filter also matches a JOIN-TABLE subcategory slug;
--   b) a new trigram `candidates` leg over subcategory labels. Without it this
--      migration REGRESSES free-text search: searching "ceramic" used to match
--      through c.label, but after §2 a ceramic tile's main category is "Tiles";
--   c) the 0.25 category-label score bonus considers subcategory labels too,
--      so a subcategory-only match doesn't score 0 and sort dead last.
--
-- products.search_vector is generated from product columns only, so it needs
-- no change.

create or replace function public.search_products(
  p_q              text    default null,
  p_category_slugs text[]  default null,
  p_brand_slugs    text[]  default null,
  p_min_price      numeric default null,   -- numeric, NOT float8: price is numeric(12,2)
  p_max_price      numeric default null,
  p_in_stock       boolean default false,
  p_sort           text    default 'relevance',
  p_limit          integer default 24,
  p_offset         integer default 0,
  p_lang           text    default 'en'
)
returns table (product_id uuid, score real, total_count bigint)
language plpgsql
stable
parallel safe
security invoker                       -- service_role already bypasses RLS;
set search_path = public, pg_temp      -- DEFINER here would leak unpublished rows to anon
as $$
declare
  v_q       text;
  v_es      boolean;
  v_cfg     regconfig;
  v_tsq     tsquery;   -- query in the requested language
  v_tsq_alt tsquery;   -- English fallback, only when the request is Spanish
begin
  v_q := nullif(btrim(coalesce(p_q, '')), '');

  -- Resolved in SQL against a closed set, never interpolated: a hostile
  -- p_lang can therefore never reach to_tsvector as an arbitrary regconfig.
  v_es  := lower(coalesce(p_lang, 'en')) like 'es%';
  v_cfg := case when v_es then 'spanish'::regconfig else 'english'::regconfig end;

  -- websearch_to_tsquery never throws on arbitrary user input (unlike
  -- to_tsquery, which throws on bare operators like "AND" or a trailing "&").
  v_tsq := websearch_to_tsquery(v_cfg, coalesce(v_q, ''));
  -- An all-stopword query ("do you have any") yields an EMPTY tsquery, and
  -- `@@` with an empty tsquery matches ZERO rows. numnode() guards that so we
  -- fall through to the trigram legs instead of returning nothing.
  if v_tsq is not null and numnode(v_tsq) = 0 then
    v_tsq := null;
  end if;

  -- The cross-language fallback. Without it a Spanish shopper sees nothing for
  -- any product whose _es fields are still NULL, which is most of the catalog
  -- early on. Scored below the native leg so a true Spanish match still wins.
  -- NULL for English callers, so English search behaviour is bit-for-bit 0005.
  if v_es then
    v_tsq_alt := websearch_to_tsquery('english', coalesce(v_q, ''));
    if v_tsq_alt is not null and numnode(v_tsq_alt) = 0 then
      v_tsq_alt := null;
    end if;
  end if;

  return query
  with candidates as (
    -- Each leg is independently index-eligible. A single flat WHERE ... OR ...
    -- spanning the joined brand/category tables would force a seq scan over
    -- products regardless of the indexes above.
    select p.id from public.products p
      where v_tsq is not null and p.search_vector @@ v_tsq
    union
    -- Separate leg, not `v_tsq || v_tsq_alt`: a union of two `@@` predicates
    -- stays index-eligible, and OR-ing the tsqueries together would also make
    -- the two languages indistinguishable for scoring.
    select p.id from public.products p
      where v_tsq_alt is not null and p.search_vector @@ v_tsq_alt
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
      where v_q is not null and p.name_es %> v_q
    union
    select p.id from public.products p
      where v_q is not null and p.short_description %> v_q
    union
    select p.id from public.products p
      where v_q is not null and p.short_description_es %> v_q
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
      where v_q is not null and (c.label %> v_q or c.label_es %> v_q)
    union
    -- 0012 (b): the same leg over a product's SUBCATEGORY labels. products
    -- now carry the parent as their main category, so without this a search
    -- for a subcategory's own label matches nothing.
    select p.id from public.products p
      join public.product_subcategories ps on ps.product_id = p.id
      join public.categories sc on sc.id = ps.category_id
      where v_q is not null and (sc.label %> v_q or sc.label_es %> v_q)
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
        + case when v_tsq_alt is not null
               then 0.80 * ts_rank_cd(p.search_vector, v_tsq_alt, 32) else 0 end
        + case when v_q is not null
               then 0.35 * greatest(
                      word_similarity(v_q, p.name),
                      word_similarity(v_q, coalesce(p.name_es, '')),
                      word_similarity(v_q, coalesce(p.short_description, '')),
                      word_similarity(v_q, coalesce(p.short_description_es, ''))) else 0 end
        + case when v_q is not null and upper(p.sku) = upper(v_q) then 5.00 else 0 end
        + case when v_q is not null and (p.name ilike v_q || '%'
                                      or p.name_es ilike v_q || '%') then 0.50 else 0 end
        -- 0012 (c): subcategory labels earn the same bonus as the main
        -- category's, so a subcategory-only match isn't stuck at score 0.
        + case when v_q is not null and (b.name ilike '%' || v_q || '%'
                                      or c.label ilike '%' || v_q || '%'
                                      or c.label_es ilike '%' || v_q || '%'
                                      or exists (
                                           select 1
                                           from public.product_subcategories ps2
                                           join public.categories sc2 on sc2.id = ps2.category_id
                                           where ps2.product_id = p.id
                                             and (sc2.label ilike '%' || v_q || '%'
                                               or sc2.label_es ilike '%' || v_q || '%')))
               then 0.25 else 0 end
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
      -- 0012 (a): a product matches on its main category's slug OR on any of
      -- its subcategories'. The caller has already expanded a parent slug to
      -- include its children (expandCategorySlugs in catalog/service.ts), so
      -- filtering by a department still catches everything tagged beneath it.
      and (p_category_slugs is null or cardinality(p_category_slugs) = 0
           or c.slug = any (p_category_slugs)
           or exists (
                select 1
                from public.product_subcategories ps
                join public.categories sc on sc.id = ps.category_id
                where ps.product_id = p.id
                  and sc.slug = any (p_category_slugs)))
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

-- Idempotent, and CREATE OR REPLACE above preserved the existing grants — but
-- re-issue them so this file is also correct standalone. CREATE FUNCTION grants
-- EXECUTE to PUBLIC by default, which PostgREST would expose to anon; the
-- browser never talks to Supabase directly (ARCHITECTURE.md §1).
revoke all on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer, text)
  to service_role;
