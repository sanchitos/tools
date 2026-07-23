import crypto from 'node:crypto';
import path from 'node:path';
import { db } from './supabase.js';
import { AppError } from './errors.js';

/**
 * Supabase Storage helpers. All uploads/deletes go through here using the
 * service-role client (bypasses storage RLS). Buckets are public-read, so the
 * returned URL is a stable CDN URL persisted on product_images.url.
 */
export const PRODUCT_IMAGES_BUCKET = 'product-images';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

export interface UploadResult {
  url: string;
  path: string;
}

/** Upload one product image under `${productId}/${uuid}.${ext}`; return public URL. */
export async function uploadProductImage(
  productId: string,
  file: UploadedFile,
): Promise<UploadResult> {
  const ext = (path.extname(file.originalname) || '.bin').toLowerCase();
  const objectPath = `${productId}/${crypto.randomUUID()}${ext}`;

  const { error } = await db.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw AppError.Internal('Image upload failed', error.message);

  const { data } = db.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(objectPath);
  return { url: data.publicUrl, path: objectPath };
}

/** Extract the storage object path from a public URL, or null if not our bucket. */
export function pathFromPublicUrl(url: string): string | null {
  const marker = `/object/public/${PRODUCT_IMAGES_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length));
}

/** Remove objects by path (no-op for empty input). Ignores already-missing objects. */
export async function removeObjects(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await db.storage.from(PRODUCT_IMAGES_BUCKET).remove(paths);
  if (error) throw AppError.Internal('Failed to remove storage objects', error.message);
}

/** Delete the storage object backing a public URL (if it lives in our bucket). */
export async function removeObjectByUrl(url: string): Promise<void> {
  const p = pathFromPublicUrl(url);
  if (p) await removeObjects([p]);
}

/** Enumerate every object path in the product-images bucket (recurses folders). */
export async function listAllObjectPaths(): Promise<string[]> {
  const root = await db.storage.from(PRODUCT_IMAGES_BUCKET).list('', { limit: 1000 });
  if (root.error) throw AppError.Internal('Failed to list storage', root.error.message);

  const paths: string[] = [];
  for (const entry of root.data ?? []) {
    // Folders come back with a null id; files carry metadata.
    if (entry.id === null) {
      const sub = await db.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .list(entry.name, { limit: 1000 });
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
