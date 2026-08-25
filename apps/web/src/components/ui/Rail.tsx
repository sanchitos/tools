import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon.js';

/**
 * Horizontal scroll rail: centered bold title + right-aligned "View all",
 * desktop-only prev/next arrows that page the scroll container.
 */
export function Rail({
  title,
  viewAllHref,
  children,
}: {
  title?: string;
  viewAllHref?: string;
  children: ReactNode;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = () => {
    const el = scrollerRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <div>
      {(title || viewAllHref) && (
        <div className="relative mb-4 flex items-center justify-center">
          {title && <h2 className="text-center font-display text-headline-md font-bold text-ink">{title}</h2>}
          {viewAllHref && (
            <Link
              to={viewAllHref}
              className="absolute right-0 text-label-sm font-semibold text-primary hover:underline"
            >
              View all →
            </Link>
          )}
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollerRef}
          onScroll={updateEdges}
          className="flex gap-gutter overflow-x-auto scroll-smooth pb-1 [-ms-overflow-style:none] [scrollbar-width:none] snap-x snap-mandatory [&::-webkit-scrollbar]:hidden"
        >
          {children}
        </div>
        {!atStart && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scrollByPage(-1)}
            className="absolute left-0 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface p-2 shadow-sm hover:bg-surface-muted lg:flex"
          >
            <Icon name="chevronLeft" className="text-xl text-ink" />
          </button>
        )}
        {!atEnd && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scrollByPage(1)}
            className="absolute right-0 top-1/2 hidden translate-x-1/2 -translate-y-1/2 rounded-full border border-border bg-surface p-2 shadow-sm hover:bg-surface-muted lg:flex"
          >
            <Icon name="chevronRight" className="text-xl text-ink" />
          </button>
        )}
      </div>
    </div>
  );
}
