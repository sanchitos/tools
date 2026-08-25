import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

/** Simple breadcrumb trail. Last item is plain text, not a link. */
export function Breadcrumbs({ items, className = '' }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={`flex flex-wrap items-center gap-1 text-label-sm text-ink-muted ${className}`}>
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {item.to && !last ? (
              <Link to={item.to} className="hover:text-primary hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={last ? 'font-semibold text-ink' : ''}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
