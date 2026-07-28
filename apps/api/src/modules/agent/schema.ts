import { z } from 'zod';

const boolParam = z.preprocess(
  (v) => (v === undefined ? undefined : v === 'true' || v === true),
  z.boolean().optional(),
);

/**
 * Agent search query (§3 of the plan). Deliberately narrower than the public
 * `productListQuerySchema`: no category/brand facets are exposed here — n8n
 * only ever fills `q` via $fromAI, and every extra model-provided parameter
 * is somewhere an LLM can hallucinate a value (e.g. `maxPrice: 5000`) that
 * silently turns a good answer into "we don't have that".
 */
export const agentSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  inStock: boolParam,
  maxPrice: z.coerce.number().nonnegative().optional(),
  // Capped low: results feed an LLM response, not a grid, and each result
  // widens the PostgREST `.in('id', …)` URL in catalog/service.ts.
  limit: z.coerce.number().int().positive().max(10).default(5),
});

export type AgentSearchParams = z.infer<typeof agentSearchQuerySchema>;
