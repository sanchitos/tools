import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

/** Max menu height, mirrored from the `max-h-64` class below (16rem = 256px). */
const MENU_MAX_H = 256;
const GAP = 4;

/**
 * Shared Select — a fixed-positioned custom dropdown (never a native <select>,
 * which mispositions in device emulation and clips inside scroll containers).
 * Keyboard-navigable; closes on outside click / Esc / when the trigger scrolls
 * out of the viewport. Scrolling elsewhere *repositions* the menu rather than
 * dismissing it, and scrolling the menu's own list does nothing.
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
  /** True when there isn't room below the trigger and there is more room above. */
  const [flipUp, setFlipUp] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const frameRef = useRef<number | null>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  /** Re-measure the trigger and decide which way the menu opens. */
  const place = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setRect(r);

    // The menu only exists once `rect` is set, so the very first call has no
    // element to measure and assumes the max height. The layout effect below
    // re-runs this once it has mounted, which is what stops a SHORT menu from
    // flipping up needlessly.
    const menuH = Math.min(menuRef.current?.scrollHeight ?? MENU_MAX_H, MENU_MAX_H);
    const below = window.innerHeight - r.bottom;
    setFlipUp(below < menuH + GAP && r.top > below);

    // Only dismiss once the trigger has actually left the viewport.
    if (r.bottom < 0 || r.top > window.innerHeight) setOpen(false);
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  // Second pass, after the portalled menu exists: measures its real height.
  const menuMounted = open && rect !== null;
  useLayoutEffect(() => {
    if (menuMounted) place();
  }, [menuMounted, options.length, place]);

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
    const schedule = () => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        place();
      });
    };
    const onScroll = (e: Event) => {
      // Scrolling the menu's own option list must not move or close it.
      if (menuRef.current?.contains(e.target as Node)) return;
      schedule();
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', schedule);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', schedule);
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [open, place]);

  // Keep the keyboard-highlighted option visible past the menu's scroll fold.
  useEffect(() => {
    if (!open) return;
    const el = menuRef.current?.children[activeIdx];
    (el as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIdx]);

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
            style={
              flipUp
                ? {
                    bottom: window.innerHeight - rect.top + GAP,
                    left: rect.left,
                    width: rect.width,
                  }
                : { top: rect.bottom + GAP, left: rect.left, width: rect.width }
            }
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
