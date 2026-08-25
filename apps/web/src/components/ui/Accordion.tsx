import { useState, type ReactNode } from 'react';
import { Icon } from './Icon.js';

/** Collapsible section — used for filter groups. */
export function Accordion({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border py-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-label-lg text-ink"
      >
        {title}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="text-ink-muted" />
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
