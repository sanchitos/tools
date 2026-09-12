import type { Locale } from '@tools-jamaica/shared';

export type { Locale };

export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Server-side language resolution for `_es` sibling columns (0009_i18n_content.sql).
 *
 * A BLANK string counts as absent, not as a translation. Without that guard an
 * admin who types into `name_es` and then clears it leaves `''` behind, and a
 * naive `row.name_es ?? row.name` renders a product with no name at all on the
 * storefront. Defended at both ends — here, and with a `.transform()` on every
 * `*Es` field in the admin zod schemas.
 */
export function pick(locale: Locale, en: string, es: string | null | undefined): string {
  return locale === 'es' && es && es.trim() ? es : en;
}

/** As `pick`, for columns that are nullable in English too. */
export function pickNullable(
  locale: Locale,
  en: string | null,
  es: string | null | undefined,
): string | null {
  return locale === 'es' && es && es.trim() ? es : en;
}
