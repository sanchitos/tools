import type { ProfileDTO, SignupResponse } from '@tools-jamaica/shared';
import { authAnon, db } from '../../lib/supabase.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendConfirmationEmail } from '../../lib/email.js';
import type { SessionTokens } from '../../lib/cookies.js';
import type { ProfileRow } from '../../types/db.js';
import type { ConfirmBody, SignupBody } from './schema.js';

export function toProfileDTO(row: ProfileRow): ProfileDTO {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isActive: row.is_active,
  };
}

/** Load a profile by user id using the service-role client (bypasses RLS). */
export async function getProfileById(id: string): Promise<ProfileDTO | null> {
  const { data, error } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw AppError.Internal('Failed to load profile', error.message);
  return data ? toProfileDTO(data as ProfileRow) : null;
}

function tokensFromSession(session: {
  access_token: string;
  refresh_token: string;
}): SessionTokens {
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

export interface AuthResult {
  profile: ProfileDTO;
  tokens: SessionTokens;
}

/**
 * True when GoTrue is telling us the address is taken. The error shape differs
 * across GoTrue versions (typed `code` on newer ones, prose on older), so match
 * both rather than pinning one.
 */
export function isEmailTaken(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'email_exists' || error.code === 'user_already_exists') return true;
  return /already (been )?registered|already exists/i.test(error.message ?? '');
}

function isEmailUnconfirmed(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'email_not_confirmed') return true;
  return /email not confirmed/i.test(error.message ?? '');
}

/** Exchange email+password for a session via GoTrue. Rejects inactive accounts. */
export async function loginWithPassword(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await authAnon.auth.signInWithPassword({ email, password });
  // Distinguished from bad credentials on purpose: "invalid email or password"
  // for someone who typed their password correctly but hasn't clicked the link
  // is a support ticket. The SPA keys off this code to offer a resend.
  if (isEmailUnconfirmed(error)) {
    throw new AppError(403, 'EMAIL_NOT_CONFIRMED', 'Please confirm your email address first.');
  }
  if (error || !data.session || !data.user) {
    throw AppError.Unauthorized('Invalid email or password');
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) throw AppError.Unauthorized('Invalid email or password');
  if (!profile.isActive) throw AppError.Forbidden('Account is disabled');

  return { profile, tokens: tokensFromSession(data.session) };
}

/** Rotate a session from a refresh token. Used by /auth/refresh and requireAuth. */
export async function refreshTokens(refreshToken: string): Promise<AuthResult> {
  const { data, error } = await authAnon.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) {
    throw AppError.Unauthorized('Session expired');
  }

  const profile = await getProfileById(data.user.id);
  if (!profile) throw AppError.Unauthorized('Session expired');
  if (!profile.isActive) throw AppError.Forbidden('Account is disabled');

  return { profile, tokens: tokensFromSession(data.session) };
}

// ---------------------------------------------------------------------------
// Signup + email confirmation
// ---------------------------------------------------------------------------

/**
 * The confirmation link points at the SPA, not at Supabase. The page POSTs the
 * token back to /auth/confirm, which verifies it server-side and sets the
 * session cookies — so the browser still never holds a token.
 */
function confirmUrl(token: string, type: 'signup' | 'magiclink'): string {
  const url = new URL('/auth/confirm', env.APP_BASE_URL);
  url.searchParams.set('token', token);
  url.searchParams.set('type', type);
  return url.toString();
}

/** Pull the one-time token out of a generateLink() response. */
function hashedToken(data: unknown): string | null {
  const props = (data as { properties?: { hashed_token?: string } } | null)?.properties;
  return props?.hashed_token ?? null;
}

/**
 * Create an UNCONFIRMED account and email the confirmation link.
 *
 * `generateLink` — not `authAnon.auth.signUp()` — because it creates the user
 * and returns the token without sending anything, leaving us the only sender
 * (no competing Supabase email) and the template in this repo. The
 * on_auth_user_created trigger makes the matching `profiles` row, role
 * 'customer'. No cookies are set: you are not signed in until you confirm.
 */
export async function signupWithPassword(input: SignupBody): Promise<SignupResponse> {
  const { data, error } = await db.auth.admin.generateLink({
    type: 'signup',
    email: input.email,
    password: input.password,
    options: { data: input.fullName ? { full_name: input.fullName } : {} },
  });

  if (error) {
    // Deliberate tradeoff: this leaks that an address is registered. A
    // storefront that silently swallows a duplicate signup produces support
    // tickets, and the enumeration risk on a hardware catalog is acceptable.
    // Flip this to a generic 202 if that judgement changes.
    if (isEmailTaken(error)) {
      throw AppError.Conflict('An account with this email already exists — sign in instead.');
    }
    throw AppError.Internal('Could not create the account', error.message);
  }

  const token = hashedToken(data);
  if (!token) throw AppError.Internal('Could not create the account', 'no confirmation token');

  await sendConfirmationEmail(input.email, confirmUrl(token, 'signup'), input.fullName ?? null);
  return { status: 'confirmation_sent', email: input.email };
}

/** Verify an emailed token and turn it into a session. */
export async function confirmSignup(token: string, type: ConfirmBody['type']): Promise<AuthResult> {
  const invalid = () => AppError.BadRequest('This confirmation link is invalid or has expired.');

  const { data, error } = await authAnon.auth.verifyOtp({ token_hash: token, type });
  if (error || !data.session || !data.user) throw invalid();

  const profile = await getProfileById(data.user.id);
  if (!profile) throw invalid();
  if (!profile.isActive) throw AppError.Forbidden('Account is disabled');

  return { profile, tokens: tokensFromSession(data.session) };
}

/**
 * Re-issue a confirmation link. `magiclink`, not `signup`: GoTrue refuses to
 * regenerate a signup link for a user that already exists, and verifying a
 * magiclink stamps `email_confirmed_at` just the same.
 *
 * Never reports failure to the caller — the route always answers 204. Unlike
 * signup this endpoint has no UX cost to being silent, so it stays
 * enumeration-safe.
 */
export async function resendConfirmation(email: string): Promise<void> {
  try {
    const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
    const token = hashedToken(data);
    if (error || !token) {
      logger.warn({ email, reason: error?.message ?? 'no token' }, 'resend confirmation skipped');
      return;
    }
    await sendConfirmationEmail(email, confirmUrl(token, 'magiclink'));
  } catch (err) {
    logger.warn({ email, err: (err as Error).message }, 'resend confirmation failed');
  }
}
