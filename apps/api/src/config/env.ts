import { z } from 'zod';

/** Treat an empty env value (`FOO=`) as unset rather than an empty string. */
const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

/**
 * The full environment, validated once at boot. If anything required is missing
 * or malformed the process exits immediately — we never run half-configured.
 */
const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  // HS256 legacy secret for token verification; JWKS is the primary path.
  SUPABASE_JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 chars'),

  APP_BASE_URL: z.string().url(),

  // Dev-only CORS allowance when the Vite dev server runs on its own origin.
  WEB_ORIGIN: z.preprocess(emptyToUndefined, z.string().url().optional()),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    console.error(
      `\n✖ Invalid environment configuration:\n${issues}\n\n` +
        `Fill apps/api/.env (see .env.example) and restart.\n`,
    );
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();

export const isProd = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
