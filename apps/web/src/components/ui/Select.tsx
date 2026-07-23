import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

/**
 * Shared Select — a fixed-positioned custom dropdown (never a native <select>,
 * which mispositions in device emulation and clips inside scroll containers).
 * Keyboard-navigable, closes on outside click / Esc / scroll.
 */
export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  useLayoutEffect(() => {
    if (open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        menuRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) choose(opt.value);
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-left text-body-md text-ink transition-colors hover:border-border-strong disabled:opacity-50 ${className}`}
      >
        <span className={selected ? '' : 'text-ink-muted'}>{selected?.label ?? placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-ink-muted">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open &&
        rect &&
        createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            className="fixed z-[100] max-h-64 overflow-auto rounded border border-border bg-surface py-1 shadow-pop"
            style={{ top: rect.bottom + 4, left: rect.left, width: rect.width }}
          >
            {options.map((opt, i) => {
              const isSel = opt.value === value;
              const isActive = i === activeIdx;
              return (
                <li
                  key={opt.value}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => choose(opt.value)}
                  className={`cursor-pointer px-3 py-2 text-body-md ${isActive ? 'bg-surface-strong' : ''} ${isSel ? 'font-semibold text-primary' : 'text-ink'}`}
                >
                  {opt.label}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
