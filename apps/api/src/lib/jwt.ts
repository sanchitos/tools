import {
  createRemoteJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  errors as joseErrors,
  type JWTPayload,
} from 'jose';
import { env } from '../config/env.js';

/**
 * Verify Supabase access tokens. JWKS (asymmetric ES256/RS256) is the primary
 * path; HS256 with the legacy shared secret is the fallback. Which one runs is
 * decided per-token by its header `alg`, so this works before AND after a project
 * migrates to asymmetric signing keys — no code change needed either way.
 *
 * (This project currently signs HS256, so the secret path is what runs today.)
 */

// Cached remote key set (jose caches keys by `kid` and refreshes on rotation).
const JWKS = createRemoteJWKSet(
  new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`),
);

const hsSecret = env.SUPABASE_JWT_SECRET
  ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
  : null;

export interface AccessClaims extends JWTPayload {
  sub: string;
  email?: string;
}

export class TokenExpiredError extends Error {
  constructor() {
    super('Access token expired');
    this.name = 'TokenExpiredError';
  }
}

export class TokenInvalidError extends Error {
  constructor(message = 'Invalid access token') {
    super(message);
    this.name = 'TokenInvalidError';
  }
}

/**
 * Verify and decode a Supabase access token. Throws TokenExpiredError on expiry
 * (caller can then refresh) or TokenInvalidError on any other failure.
 */
export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { alg } = decodeProtectedHeader(token);
    const isHs = typeof alg === 'string' && alg.startsWith('HS');

    if (isHs) {
      if (!hsSecret) {
        throw new TokenInvalidError('HS256 token but SUPABASE_JWT_SECRET is not configured');
      }
      const { payload } = await jwtVerify(token, hsSecret);
      return payload as AccessClaims;
    }

    const { payload } = await jwtVerify(token, JWKS);
    return payload as AccessClaims;
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw new TokenExpiredError();
    if (err instanceof TokenInvalidError) throw err;
    throw new TokenInvalidError(err instanceof Error ? err.message : undefined);
  }
}
