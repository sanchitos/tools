-- ============================================================================
-- 0004_storage.sql — Supabase Storage buckets for catalog imagery
--
-- Buckets are PUBLIC-READ (served via CDN URL). Uploads/deletes happen ONLY
-- through Express using the service-role key (which bypasses storage RLS), so we
-- add a public read policy but no write policies for anon/authenticated.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('brand-logos',    'brand-logos',    true)
on conflict (id) do nothing;

-- Public read of objects in these two buckets (defense-in-depth alongside the
-- public-bucket CDN URLs).
drop policy if exists "catalog images are publicly readable" on storage.objects;
create policy "catalog images are publicly readable" on storage.objects
  for select using (bucket_id in ('product-images', 'brand-logos'));

-- No insert/update/delete policies -> anon/authenticated cannot write. Express
-- (service role) performs all uploads and deletions.
