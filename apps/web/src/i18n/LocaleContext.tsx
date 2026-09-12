import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { setApiLocale } from '../lib/api.js';
import { en } from './en.js';
import { es } from './es.js';
import { detectInitialLocale, persistLocale, type Locale } from './locale.js';
import type { Dictionary, TranslationKey } from './en.js';

const DICTS: Record<Locale, Dictionary> = { en, es };

export type TFunction = (key: TranslationKey, vars?: Record<string, string | number>) => string;

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TFunction;
}

const LocaleContext = createContext<LocaleState | null>(null);

/** `{name}` interpolation — the only formatting feature the copy actually uses. */
function translate(dict: Dictionary, key: TranslationKey, vars?: Record<string, string | number>): string {
  const template = dict[key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) =>
    name in vars ? String(vars[name]) : _match,
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    persistLocale(locale);
    // Keep the fetch layer in step with the UI. main.tsx does this once before
    // the first render; this handles every subsequent switch.
    setApiLocale(locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const t = useCallback<TFunction>(
    (key, vars) => translate(DICTS[locale], key, vars),
    [locale],
  );

  const value = useMemo<LocaleState>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleState {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider');
  return ctx;
}

/** Sugar for the common case — `const t = useT()`. */
export function useT(): TFunction {
  return useLocale().t;
}
