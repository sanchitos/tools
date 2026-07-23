import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-dark',
  accent: 'bg-accent text-accent-fg hover:bg-accent-hover',
  outline: 'border-2 border-primary text-primary hover:bg-primary hover:text-primary-fg',
  ghost: 'text-ink-muted hover:text-primary hover:bg-surface-muted',
  danger: 'bg-error text-error-fg hover:opacity-90',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-label-sm',
  md: 'px-5 py-2.5 text-label-lg',
  lg: 'px-8 py-4 text-label-lg',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Weighty industrial button. Defaults to the navy primary. */
export function Button({ variant = 'primary', size = 'md', className = '', children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
