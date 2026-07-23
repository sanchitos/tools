/**
 * Injects a valid dummy environment before any module (env.ts validates at
 * import time). These values never reach a real Supabase project in tests.
 */
process.env.NODE_ENV = 'test';
process.env.PORT ??= '4000';
process.env.SUPABASE_URL ??= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.SUPABASE_ANON_KEY ??= 'test-anon-key';
process.env.SUPABASE_JWT_SECRET ??= 'test-jwt-secret';
process.env.COOKIE_SECRET ??= 'test-cookie-secret-at-least-16-chars';
process.env.APP_BASE_URL ??= 'https://tools-jamaica.test';
