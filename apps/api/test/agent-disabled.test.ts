import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// A separate file, deliberately: this exercises the "AGENT_API_KEY is unset"
// branch of requireAgentKey (middleware/agentAuth.ts), which precomputes its
// expected-key digest once at module load. AGENT_API_KEY is never set in
// test/setup.ts (it's optional — see config/env.ts), so this file's fresh
// module registry sees it unset by default, matching a real deploy that
// forgot to configure it. agent.test.ts covers the "configured" branch in
// its own file/process for the opposite reason — see the comment there.
vi.mock('../src/lib/supabase.js', () => import('./helpers/mockSupabase.js'));

import { createApp } from '../src/app.js';

const app = createApp();

describe('agent API (/api/v1/agent), AGENT_API_KEY unset', () => {
  it('404s the whole route (fails closed rather than opening)', async () => {
    const res = await request(app).get('/api/v1/agent/products/search?q=door');
    expect(res.status).toBe(404);
  });
});
