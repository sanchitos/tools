import type { AgentSearchResult } from '@tools-jamaica/shared';
import { listCategories, listProducts } from '../catalog/service.js';
import { toAgentProductDTO } from './mappers.js';
import type { AgentSearchParams } from './schema.js';

/**
 * Delegates ranking/filtering entirely to catalog `listProducts()` (the same
 * search_products RPC path the storefront uses — one search implementation,
 * see 0005_search.sql) and only reshapes the result for the agent DTO. No
 * separate query path, so this can never drift from the storefront's results
 * or bypass resolvePrice().
 */
export async function searchProductsForAgent(params: AgentSearchParams): Promise<AgentSearchResult> {
  const { items, total } = await listProducts({
    q: params.q,
    inStock: params.inStock,
    maxPrice: params.maxPrice,
    page: 1,
    pageSize: params.limit,
    // The agent answers in English for now; plumbing a locale through
    // agentSearchQuerySchema is additive when the WhatsApp flow needs Spanish.
    lang: 'en',
  });

  if (total === 0) {
    // Give the agent something true to offer instead of letting the model
    // invent a product to fill the silence (see promptgrok.md's zero-result rule).
    const categories = await listCategories('en');
    return {
      items: [],
      total: 0,
      categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
    };
  }

  return { items: items.map(toAgentProductDTO), total };
}
