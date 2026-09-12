import type { ReactNode } from 'react';

const inputClass =
  'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40';

const chip =
  'inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-surface-strong text-label-xs font-bold uppercase text-primary';

interface Props {
  label: string;
  /** English value — the canonical one. Required by the DB where marked. */
  value: string;
  onChange: (value: string) => void;
  /** Spanish sibling. Blank is sent as null, so the storefront falls back. */
  valueEs: string;
  onChangeEs: (value: string) => void;
  required?: boolean;
  textarea?: boolean;
  rows?: number;
  placeholder?: string;
  hint?: ReactNode;
}

/**
 * An English input with its Spanish sibling stacked beneath, under small EN/ES
 * chips. The admin back-office chrome stays English by agreement; only the
 * *content* is bilingual, so this is the single control that makes every
 * `_es` column editable without a second form or a language toggle.
 *
 * The Spanish placeholder says "(same as English)" because that is exactly what
 * leaving it blank does — NULL means "not translated yet" and the API falls
 * back (lib/locale.ts pick()).
 */
export function BilingualField({
  label,
  value,
  onChange,
  valueEs,
  onChangeEs,
  required = false,
  textarea = false,
  rows = 3,
  placeholder,
  hint,
}: Props) {
  const common = { className: inputClass, placeholder };

  return (
    <div className="block">
      <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
        {label}
        {required && ' *'}
      </span>
      <div className="space-y-1.5">
        <div className="flex items-start gap-2">
          <span className={chip}>EN</span>
          {textarea ? (
            <textarea
              {...common}
              rows={rows}
              required={required}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          ) : (
            <input
              {...common}
              required={required}
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          )}
        </div>
        <div className="flex items-start gap-2">
          <span className={chip}>ES</span>
          {textarea ? (
            <textarea
              className={inputClass}
              rows={rows}
              placeholder="(same as English)"
              value={valueEs}
              onChange={(e) => onChangeEs(e.target.value)}
            />
          ) : (
            <input
              className={inputClass}
              placeholder="(same as English)"
              value={valueEs}
              onChange={(e) => onChangeEs(e.target.value)}
            />
          )}
        </div>
      </div>
      {hint && <p className="mt-1 text-label-sm text-ink-muted">{hint}</p>}
    </div>
  );
}

/** Blank -> null, matching the `esText` zod transform on the server. */
export const esOrNull = (v: string): string | null => (v.trim() ? v.trim() : null);
