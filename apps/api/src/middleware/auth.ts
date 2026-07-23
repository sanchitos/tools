import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ProfileDTO, Role } from '@tools-jamaica/shared';
import { COOKIE, clearSession, setSession } from '../lib/cookies.js';
import { verifyAccessToken } from '../lib/jwt.js';
import { AppError } from '../lib/errors.js';
import { getProfileById, refreshTokens } from '../modules/auth/service.js';

/** Verify the access-token cookie -> profile, or null if absent/invalid/expired. */
async function profileFromAccessCookie(req: Request): Promise<ProfileDTO | null> {
  const token = req.signedCookies?.[COOKIE.accessToken] as string | undefined;
  if (!token) return null;
  try {
    const claims = await verifyAccessToken(token);
    if (!claims.sub) return null;
    return await getProfileById(claims.sub);
  } catch {
    return null; // expired or invalid -> caller falls back to refresh
  }
}

/** Transparently rotate the session from the refresh cookie, or null if it can't. */
async function profileFromRefreshCookie(
  req: Request,
  res: Response,
): Promise<ProfileDTO | null> {
  const refreshToken = req.signedCookies?.[COOKIE.refreshToken] as string | undefined;
  if (!refreshToken) return null;
  try {
    const { profile, tokens } = await refreshTokens(refreshToken);
    setSession(res, tokens); // rotate cookies
    return profile;
  } catch {
    clearSession(res);
    return null;
  }
}

async function resolveUser(req: Request, res: Response): Promise<ProfileDTO | null> {
  const fromAccess = await profileFromAccessCookie(req);
  if (fromAccess) {
    if (!fromAccess.isActive) return null;
    return fromAccess;
  }
  const fromRefresh = await profileFromRefreshCookie(req, res);
  if (fromRefresh && fromRefresh.isActive) return fromRefresh;
  return null;
}

/**
 * Require a valid session. Verifies the access-token cookie and, if it's
 * expired/invalid, transparently refreshes and rotates the cookies before
 * continuing. 401 if no valid session can be established.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  resolveUser(req, res)
    .then((user) => {
      if (!user) return next(AppError.Unauthorized('Authentication required'));
      req.user = user;
      next();
    })
    .catch(next);
};

/** Gate a route to a specific role. Use after requireAuth. */
export function requireRole(role: Role): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(AppError.Unauthorized('Authentication required'));
    if (req.user.role !== role) return next(AppError.Forbidden('Insufficient permissions'));
    next();
  };
}

/**
 * Populate req.user if a valid session exists, but never block. Forward-compat
 * for the public catalog once customer pricing tiers exist (unused in Phase 1).
 */
export const optionalAuth: RequestHandler = (req, res, next) => {
  resolveUser(req, res)
    .then((user) => {
      if (user) req.user = user;
      next();
    })
    .catch(() => next());
};
