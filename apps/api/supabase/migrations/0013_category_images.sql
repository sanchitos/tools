-- ============================================================================
-- 0013_category_images.sql — a Storage bucket for category & subcategory images
--
-- Categories were the last image in the admin that was URL-only: products,
-- brands, the hero, tiles and locations all upload a real file through Express
-- (service role) -> Supabase Storage. This adds the bucket that backs
-- POST /api/v1/admin/categories/:id/image.
--
-- A DISTINCT bucket, not site-images/categories, deliberately. The orphan sweep
-- (modules/admin/service.ts SWEEPS) may only touch a bucket paired with EVERY
-- column that references it; categories.image_url is a single such column, so
-- this bucket is safe to sweep. site-images spans three tables and is excluded
-- from the sweep for exactly that reason — folding categories into it would
-- keep category images unsweepable forever.
--
-- Subcategories need nothing extra: they are rows in the same public.categories
-- table (parent_id), so one bucket and one endpoint cover both levels.
--
-- Run by hand in the Supabase SQL Editor, after 0012. Re-runnable.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('category-images', 'category-images', true)
on conflict (id) do nothing;

-- Public read (defense-in-depth alongside the public-bucket CDN URLs). The
-- policy is recreated WHOLESALE, so every bucket must be listed — dropping one
-- from this list silently breaks public reads for it. No insert/update/delete
-- policies: Express (service role) performs all uploads and deletions.
drop policy if exists "catalog images are publicly readable" on storage.objects;
create policy "catalog images are publicly readable" on storage.objects
  for select using (
    bucket_id in ('product-images', 'brand-logos', 'site-images', 'category-images')
  );
