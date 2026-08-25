import { Icon } from './Icon.js';

/** Numbered pager with windowed page numbers and ellipsis truncation. */
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(pageCount, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const btnBase =
    'flex h-9 min-w-9 items-center justify-center rounded px-2 text-label-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1">
      <button
        type="button"
        aria-label="First page"
        disabled={page <= 1}
        onClick={() => onChange(1)}
        className={`${btnBase} text-ink-muted hover:bg-surface-muted`}
      >
        «
      </button>
      <button
        type="button"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className={`${btnBase} text-ink-muted hover:bg-surface-muted`}
      >
        <Icon name="chevronLeft" />
      </button>

      {start > 1 && <span className="px-1 text-ink-muted">…</span>}

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          aria-current={p === page ? 'page' : undefined}
          onClick={() => onChange(p)}
          className={`${btnBase} ${p === page ? 'bg-primary text-primary-fg' : 'text-ink hover:bg-surface-muted'}`}
        >
          {p}
        </button>
      ))}

      {end < pageCount && <span className="px-1 text-ink-muted">…</span>}

      <button
        type="button"
        aria-label="Next page"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className={`${btnBase} text-ink-muted hover:bg-surface-muted`}
      >
        <Icon name="chevronRight" />
      </button>
      <button
        type="button"
        aria-label="Last page"
        disabled={page >= pageCount}
        onClick={() => onChange(pageCount)}
        className={`${btnBase} text-ink-muted hover:bg-surface-muted`}
      >
        »
      </button>
    </nav>
  );
}
