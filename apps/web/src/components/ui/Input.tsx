import type { InputHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon.js';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  icon?: IconName;
}

/** Shared text input. Token-only styling, optional leading icon. */
export function Input({ icon, className = '', ...rest }: Props) {
  if (!icon) {
    return (
      <input
        className={`w-full rounded border border-border bg-surface px-3 py-2 text-body-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${className}`}
        {...rest}
      />
    );
  }
  return (
    <div className="relative">
      <Icon name={icon} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        className={`w-full rounded border border-border bg-surface py-2 pl-9 pr-3 text-body-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 ${className}`}
        {...rest}
      />
    </div>
  );
}
