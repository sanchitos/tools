import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.js';

interface Props {
  open: boolean;
  side?: 'left' | 'right';
  title?: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** English default; public callers pass t(...). ui/* never imports i18n/. */
  closeLabel?: string;
}

/** Slide-in panel (mobile filters, department nav, cart). Portal, Esc + backdrop close. */
export function Drawer({
  open,
  side = 'right',
  title,
  onClose,
  footer,
  children,
  closeLabel = 'Close',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const sideClass = side === 'left' ? 'left-0' : 'right-0';

  return createPortal(
    <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/50" onMouseDown={onClose} aria-hidden="true" />
      <div
        className={`absolute top-0 ${sideClass} flex h-full w-full max-w-sm flex-col bg-surface shadow-pop`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-4">
            <h2 className="text-headline-sm text-ink">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            >
              <Icon name="close" className="text-2xl" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="shrink-0 border-t border-border p-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
