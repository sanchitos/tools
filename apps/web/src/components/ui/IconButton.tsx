import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon.js';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName;
  label: string;
}

/** Square icon-only button with a mandatory accessible label. */
export function IconButton({ icon, label, className = '', ...rest }: Props) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`flex h-10 w-10 items-center justify-center rounded text-xl transition-colors hover:bg-surface-muted disabled:opacity-50 ${className}`}
      {...rest}
    >
      <Icon name={icon} />
    </button>
  );
}
