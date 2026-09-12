import type { ReactNode } from 'react';
import { Container } from './ui/Container.js';

/**
 * The centered card shared by /signup, /login and /auth/confirm. Lives in
 * components/ rather than components/ui/ on purpose: ui/* is shared with the
 * English-only admin back-office, and these three pages are storefront chrome.
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Container className="py-12">
      <div className="mx-auto w-full max-w-md rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
        <h1 className="font-display text-headline-lg text-primary">{title}</h1>
        {subtitle && <p className="mt-1 text-body-md text-ink-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 border-t border-border pt-4 text-body-sm text-ink-muted">{footer}</div>}
      </div>
    </Container>
  );
}
