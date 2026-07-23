import { vi } from 'vitest';

/**
 * Hermetic stand-in for lib/supabase.ts. Tests queue per-table results and the
 * chainable builder resolves them when awaited (or via maybeSingle/single).
 * Keeps the suite fast and offline while exercising the real handlers/mappers.
 */
export interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number;
}

const queues: Record<string, QueryResult[]> = {};
let signInResult: unknown = null;
let refreshResult: unknown = null;

export function queueResult(table: string, result: QueryResult): void {
  (queues[table] ??= []).push(result);
}
export function setSignIn(result: unknown): void {
  signInResult = result;
}
export function setRefresh(result: unknown): void {
  refreshResult = result;
}
export function resetMocks(): void {
  for (const k of Object.keys(queues)) delete queues[k];
  signInResult = null;
  refreshResult = null;
}

function take(table: string): QueryResult {
  const q = queues[table];
  return q && q.length ? q.shift()! : { data: [], error: null, count: 0 };
}

const CHAIN = ['select', 'eq', 'in', 'gte', 'lte', 'gt', 'neq', 'or', 'ilike', 'order', 'range', 'limit'];

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const m of CHAIN) b[m] = vi.fn(chain);
  b.insert = vi.fn(chain);
  b.update = vi.fn(chain);
  b.delete = vi.fn(chain);
  b.maybeSingle = vi.fn(() => Promise.resolve(take(table)));
  b.single = vi.fn(() => Promise.resolve(take(table)));
  // Make the builder awaitable directly (e.g. `await db.from(x).select()...`).
  b.then = (res: (v: QueryResult) => unknown, rej: (e: unknown) => unknown) =>
    Promise.resolve(take(table)).then(res, rej);
  return b;
}

export const db = {
  from: vi.fn((t: string) => builder(t)),
  auth: { admin: {} },
  storage: {},
};

export const authAnon = {
  auth: {
    signInWithPassword: vi.fn(async () => signInResult),
    refreshSession: vi.fn(async () => refreshResult),
    signOut: vi.fn(async () => ({ error: null })),
  },
};
