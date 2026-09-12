import type { Locale } from '@tools-jamaica/shared';

export type { Locale };

export const LOCALES: readonly Locale[] = ['en', 'es'] as const;
export const DEFAULT_LOCALE: Locale = 'en';

/** Matches the existing `tj_cart_v1` storage-key convention. */
const STORAGE_KEY = 'tj_locale';

function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'es';
}

/**
 * Stored choice > browser language > English.
 *
 * Framework-free on purpose: main.tsx must call this BEFORE createRoot().render()
 * so `setApiLocale` is set before HomePage's first catalog fetch goes out.
 * Storage access is wrapped like CartContext — it throws in a private window
 * or with site data blocked.
 */
export function detectInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage unavailable — fall through to the browser language.
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language : '';
  return nav?.toLowerCase().startsWith('es') ? 'es' : DEFAULT_LOCALE;
}

export function persistLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Non-fatal: the switch still applies for this session.
  }
}
