-- 0007_category_hierarchy.sql
-- Adds a two-level parent/child hierarchy to public.categories.
-- Depth is enforced at exactly 2 levels in the API (see modules/admin/service.ts
-- validateParent()); the DB only guards against a category being its own parent.
-- Idempotent: safe to re-run.

alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete restrict;

create index if not exists idx_categories_parent on public.categories (parent_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_no_self_parent'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_no_self_parent check (parent_id is null or parent_id <> id);
  end if;
end $$;
