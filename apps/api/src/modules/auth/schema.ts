import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1).max(200),
});

export type LoginBody = z.infer<typeof loginSchema>;

/**
 * Public self-signup. There is deliberately NO `role` field — a self-registered
 * account is always a `customer` (that is the DB default, set by the
 * on_auth_user_created trigger). Admins are created from the admin Users page.
 */
export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120).optional(),
});

/**
 * `type` accepts magiclink as well as signup: a *resent* confirmation is issued
 * as a magiclink (GoTrue cannot regenerate a `signup` link for an existing
 * user), and verifying one also stamps `email_confirmed_at`.
 */
export const confirmSchema = z.object({
  token: z.string().min(1).max(500),
  type: z.enum(['signup', 'magiclink']).default('signup'),
});

export const resendConfirmationSchema = z.object({
  email: z.string().trim().email(),
});

export type SignupBody = z.infer<typeof signupSchema>;
export type ConfirmBody = z.infer<typeof confirmSchema>;
