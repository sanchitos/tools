import type { ReactNode } from 'react';

/** Centered max-width page container matching the Stitch 1280px grid + gutters. */
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-container px-4 lg:px-10 ${className}`}>{children}</div>;
}
