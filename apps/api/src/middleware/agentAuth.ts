import { createHash, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/** Precomputed once at boot. null => the feature is unconfigured => the route fails CLOSED. */
const expected = env.AGENT_API_KEY ? sha256(env.AGENT_API_KEY) : null;

/**
 * Machine-to-machine gate for /api/v1/agent (the n8n WhatsApp agent's
 * SearchProducts tool, and any future agent consumer). Bearer header, never
 * a query param: app.ts's pino-http `req` serializer logs the full URL, so a
 * key in the query string would land in the logs.
 */
export const requireAgentKey: RequestHandler = (req, _res, next) => {
  if (!expected) return next(AppError.NotFound('Not found'));

  const header = req.get('authorization') ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!presented) return next(AppError.Unauthorized('Agent key required'));

  // Hash both sides to fixed-length digests first: timingSafeEqual throws a
  // RangeError on differing input lengths, which would turn a wrong-length
  // key into a 500 instead of a 401 and make the exception itself a length
  // oracle.
  if (!timingSafeEqual(sha256(presented), expected)) {
    return next(AppError.Unauthorized('Invalid agent key'));
  }
  next();
};
