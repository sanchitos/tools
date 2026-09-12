import crypto from 'node:crypto';
import path from 'node:path';
import { db } from './supabase.js';
import { AppError } from './errors.js';

/**
 * Supabase Storage helpers. All uploads/deletes go through here using the
 * service-role client (bypasses storage RLS). Buckets are public-read, so the
 * returned URL is a stable CDN URL persisted on the owning row.
 *
 * EVERY function takes the bucket FIRST, with no default. A convenience default
 * would mean a wrong bucket silently leaves orphans behind — and `removeObjects`
 * backs a destructive sweep (see cleanupOrphans in modules/admin/service.ts).
 * Making the compiler stop at every call site is worth the extra argument.
 */
export const PRODUCT_IMAGES_BUCKET = 'product-images';
export const BRAND_LOGOS_BUCKET = 'brand-logos';
export const SITE_IMAGES_BUCKET = 'site-images';

export type Bucket =
  | typeof PRODUCT_IMAGES_BUCKET
  | typeof BRAND_LOGOS_BUCKET
  | typeof SITE_IMAGES_BUCKET;

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface UploadResult {
  url: string;
  path: string;
}

/**
 * Upload one object under `${prefix}/${uuid}.${ext}`; return its public URL.
 * `prefix` is the owning row's id (product, brand) or a fixed folder name for
 * singleton content ('hero', 'tiles', 'locations').
 */
export async function uploadObject(
  bucket: Bucket,
  prefix: string,
  file: UploadedFile,
): Promise<UploadResult> {
  const ext = (path.extname(file.originalname) || '.bin').toLowerCase();
  const objectPath = `${prefix}/${crypto.randomUUID()}${ext}`;

  const { error } = await db.storage
    .from(bucket)
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw AppError.Internal('Image upload failed', error.message);

  const { data } = db.storage.from(bucket).getPublicUrl(objectPath);
  return { url: data.publicUrl, path: objectPath };
}

/** Thin wrapper so the product-image path reads exactly as it did before. */
export async function uploadProductImage(
  productId: string,
  file: UploadedFile,
): Promise<UploadResult> {
  return uploadObject(PRODUCT_IMAGES_BUCKET, productId, file);
}

/**
 * Extract the storage object path from a public URL, or null if the URL is not
 * in `bucket`.
 *
 * This null return is load-bearing: it is what stops deleteProduct() and
 * cleanupOrphans() from ever touching an external seed URL (ARCHITECTURE §5).
 * Generalizing across buckets must not weaken it — hence the bucket is part of
 * the marker, not stripped from it.
 */
export function pathFromPublicUrl(bucket: Bucket, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

/** Remove objects by path (no-op for empty input). Ignores already-missing objects. */
export async function removeObjects(bucket: Bucket, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(bucket).remove(paths);
  if (error) throw AppError.Internal('Failed to remove storage objects', error.message);
}

/** Delete the storage object backing a public URL (if it lives in `bucket`). */
export async function removeObjectByUrl(bucket: Bucket, url: string): Promise<void> {
  const p = pathFromPublicUrl(bucket, url);
  if (p) await removeObjects(bucket, [p]);
}

/** Enumerate every object path in `bucket` (recurses one folder level). */
export async function listAllObjectPaths(bucket: Bucket): Promise<string[]> {
  const root = await db.storage.from(bucket).list('', { limit: 1000 });
  if (root.error) throw AppError.Internal('Failed to list storage', root.error.message);

  const paths: string[] = [];
  for (const entry of root.data ?? []) {
    // Folders come back with a null id; files carry metadata.
    if (entry.id === null) {
      const sub = await db.storage.from(bucket).list(entry.name, { limit: 1000 });
      if (sub.error) throw AppError.Internal('Failed to list storage', sub.error.message);
      for (const f of sub.data ?? []) {
        if (f.id !== null) paths.push(`${entry.name}/${f.name}`);
      }
    } else {
      paths.push(entry.name);
    }
  }
  return paths;
}
