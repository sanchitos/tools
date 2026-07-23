import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Two server-side Supabase clients. NEITHER ever reaches the browser — Express is
 * the only thing that talks to Supabase (the SPA ships no @supabase/supabase-js).
 *
 * - `db`       — service-role key. Full data access, BYPASSES RLS, and performs
 *                GoTrue admin ops. This is the workhorse for all catalog/admin
 *                queries. Never expose this client or its key to the client.
 * - `authAnon` — anon key. Used only to drive GoTrue as a normal user
 *                (signInWithPassword / refresh / signOut) during cookie-proxied
 *                auth. It cannot read protected data (RLS applies).
 */
const noPersist = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

export const db: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  noPersist,
);

export const authAnon: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  noPersist,
);
