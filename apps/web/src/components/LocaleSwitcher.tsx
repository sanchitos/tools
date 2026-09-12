import { useLocation } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext.js';
import type { Locale } from '../i18n/locale.js';

const OPTIONS: { value: Locale; short: string; labelKey: 'nav.english' | 'nav.spanish' }[] = [
  { value: 'en', short: 'EN', labelKey: 'nav.english' },
  { value: 'es', short: 'ES', labelKey: 'nav.spanish' },
];

/**
 * Two-button segmented control — not the `Select` primitive, which is overkill
 * for two options and needs a popup for something that should be one click.
 *
 * Hidden on /checkout: switching language remounts the routed tree (App.tsx),
 * which would wipe a half-typed delivery address.
 */
export function LocaleSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();
  const { pathname } = useLocation();

  if (pathname.startsWith('/checkout')) return null;

  return (
    <div
      className={`flex items-center overflow-hidden rounded border border-border ${className}`}
      role="group"
      aria-label={t('nav.language')}
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === locale;
        return (
          <button
            key={opt.value}
            type="button"
            lang={opt.value}
            aria-pressed={active}
            aria-label={t(opt.labelKey)}
            onClick={() => setLocale(opt.value)}
            className={`px-2 py-1 text-label-sm font-semibold transition-colors ${
              active
                ? 'bg-primary text-primary-fg'
                : 'bg-surface text-ink-muted hover:text-primary'
            }`}
          >
            {opt.short}
          </button>
        );
      })}
    </div>
  );
}
