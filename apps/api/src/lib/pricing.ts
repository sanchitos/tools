import type { ProfileDTO } from '@tools-jamaica/shared';
import type { ProductRow } from '../types/db.js';

/**
 * The single server-side pricing authority. Phase 1 always returns the public
 * `price`, but EVERY price that leaves the API must flow through here — never
 * trust a client-supplied price. This is the seam for tiered / installer (B2B)
 * pricing later: add the logic here, keyed off `user`, and nothing else changes.
 *
 * @param product the DB product row
 * @param _user   the authenticated user, if any (unused in Phase 1)
 */
export function resolvePrice(product: ProductRow, _user?: ProfileDTO): number {
  return Number(product.price);
}
