import type { ProfileDTO } from '@tools-jamaica/shared';
import { authAnon, db } from '../../lib/supabase.js';
import { AppError } from '../../lib/errors.js';
import type { SessionTokens } from '../../lib/cookies.js';
import type { ProfileRow } from '../../types/db.js';

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

/** Exchange email+password for a session via GoTrue. Rejects inactive accounts. */
export async function loginWithPassword(email: string, password: string): Promise<AuthResult> {
  const { data, error } = await authAnon.auth.signInWithPassword({ email, password });
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
