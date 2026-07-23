import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button.js';

interface Props {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Shared confirmation modal for destructive actions (never window.confirm). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-pop">
        <h2 className="text-headline-md text-ink">{title}</h2>
        {message && <p className="mt-2 text-body-md text-ink-muted">{message}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
