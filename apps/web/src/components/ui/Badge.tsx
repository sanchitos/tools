import type { ReactNode } from 'react';

type Tone = 'accent' | 'navy' | 'neutral' | 'success' | 'error';

const tones: Record<Tone, string> = {
  accent: 'bg-accent text-accent-fg',
  navy: 'bg-primary text-primary-fg',
  neutral: 'bg-surface-strong text-primary',
  success: 'bg-success text-success-fg',
  error: 'bg-error text-error-fg',
};

/** Chip/badge — categories, statuses, price tags. */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-1 text-label-sm font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
