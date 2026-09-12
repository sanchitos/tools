-- ============================================================================
-- 0009_i18n_content.sql — Spanish sibling columns + bilingual search
--
-- The site ships English/Spanish. Rather than a translations table (a join on
-- every catalog read, and a shape the mappers would have to reduce at runtime),
-- each translatable column gets a nullable `_es` sibling. NULL means "not
-- translated yet" and the API falls back to English, so the storefront is never
-- broken mid-translation and the client can translate incrementally.
--
-- NOT translated, deliberately:
--   * brands.name  — proper nouns and registered trademarks (DeWalt, Bosch).
--     `brands.slug` is also the URL-facing filter facet, so an alias would
--     create a name/slug coherence gap for no user benefit.
--   * every `slug`  — one canonical URL per product keeps getProductBySlug,
--     ensureUniqueSlug and the shop filter params single-valued. A Spanish
--     slug would need a redirect table and a second unique index.
--
-- Run by hand in the Supabase SQL Editor, after 0008. Re-runnable.
-- ============================================================================

-- --- 1. Spanish sibling columns --------------------------------------------
-- Nullable with NO default: '' and NULL must not be confused. The API treats a
-- blank string as absent too (lib/locale.ts pick()), and the admin zod schemas
-- transform blank -> null on write, so a cleared field falls back rather than
-- rendering an empty product name.
alter table public.products
  add column if not exists name_es              text,
  add column if not exists short_description_es text,
  add column if not exists description_es       text;

alter table public.categories
  add column if not exists label_es text;

alter table public.product_specs
  add column if not exists label_es text,
  add column if not exists value_es text;

alter table public.product_highlights
  add column if not exists text_es text;


-- --- 2. Bilingual search vector --------------------------------------------
-- ONE mixed-config vector, not a second `search_vector_es` column. Both
-- to_tsvector('english', …) and to_tsvector('spanish', …) are two-arg and
-- therefore IMMUTABLE, so both are legal inside a generated expression (see
-- the note in 0005). pg_catalog.spanish ships with stock Postgres and is
-- present on Supabase — no extension, no dictionary install.
--
-- The mix is what makes partial translation searchable: for a long time most
-- rows will have NULL name_es, and a Spanish shopper querying a Spanish-only
-- vector would find NOTHING for untranslated products. Here the English
-- lexemes stay in the same vector, and the RPC ORs in an English tsquery as a
-- lower-weighted fallback leg.
--
-- Drop-then-add, as in 0005: a generated column's expression cannot be
-- ALTERed in place. The _es columns above must exist before this references
-- them — hence the ordering within this file.
alter table public.products drop column if exists search_vector;

alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(name_es, '')), 'A') ||
    -- SKUs are hyphen-split so partial SKU queries ("SIENNA 75") still hit.
    -- Not translated: a part number is language-neutral.
    setweight(to_tsvector('english', coalesce(replace(sku, '-', ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(short_description_es, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('spanish', coalesce(description_es, '')), 'C')
  ) stored;

-- MANDATORY, not defensive: `drop column` above dropped the GIN index with it.
-- Omit this and every search silently degrades to a seq scan.
create index if not exists idx_products_search_vector
  on public.products using gin (search_vector);

-- Trigram indexes backing the new Spanish word_similarity legs in the RPC,
-- mirroring the English ones from 0001/0005.
create index if not exists idx_products_name_es_trgm
  on public.products using gin (name_es gin_trgm_ops);
create index if not exists idx_products_short_desc_es_trgm
  on public.products using gin (short_description_es gin_trgm_ops);
create index if not exists idx_categories_label_es_trgm
  on public.categories using gin (label_es gin_trgm_ops);


-- --- 3. Ranking RPC, now language-aware ------------------------------------
-- Adds p_lang. BOTH prior signatures must be dropped: `create or replace`
-- cannot change a signature — it creates an OVERLOAD, and PostgREST then
-- returns 300 ("could not choose the best candidate function") on every
-- search. Drop the 9-arg form from 0005 and any 10-arg form from a re-run of
-- this file.
drop function if exists public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer);
drop function if exists public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer, text);

create function public.search_products(
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
        + case when v_q is not null and (b.name ilike '%' || v_q || '%'
                                      or c.label ilike '%' || v_q || '%'
                                      or c.label_es ilike '%' || v_q || '%') then 0.25 else 0 end
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

-- Grants are bound to the argument list, so they died with the DROP above and
-- MUST be re-issued against the new 10-arg signature — otherwise the API loses
-- EXECUTE and every search 500s. CREATE FUNCTION also grants EXECUTE to PUBLIC
-- by default, which PostgREST would expose to anon; the browser never talks to
-- Supabase directly (ARCHITECTURE.md §1).
revoke all on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer, text)
  from public, anon, authenticated;
grant execute on function public.search_products(
  text, text[], text[], numeric, numeric, boolean, text, integer, integer, text)
  to service_role;
