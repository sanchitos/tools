import type { AgentProductDTO, ProductSummaryDTO } from '@tools-jamaica/shared';
import { env } from '../../config/env.js';

/**
 * Shrinks the public ProductSummaryDTO down to the agent shape: no id,
 * images, rating, or reviewCount, and brand/category flattened to their
 * display name — fields an LLM answer never uses, but that cost real tokens
 * on every turn (see AgentProductDTO's doc comment in packages/shared).
 */
export function toAgentProductDTO(p: ProductSummaryDTO): AgentProductDTO {
  return {
    name: p.name,
    sku: p.sku,
    price: p.price,
    currency: p.currency,
    inStock: p.stock > 0,
    stockCount: p.stock,
    brand: p.brand?.name ?? null,
    category: p.category?.label ?? null,
    shortDescription: p.shortDescription,
    url: `${env.APP_BASE_URL}/product/${p.slug}`,
  };
}
