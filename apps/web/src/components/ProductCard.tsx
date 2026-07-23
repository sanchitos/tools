import { Link } from 'react-router-dom';
import type { ProductSummaryDTO } from '@tools-jamaica/shared';
import { ImageWithFallback } from './ui/ImageWithFallback.js';
import { Badge } from './ui/Badge.js';
import { formatPrice } from '../lib/format.js';

/** Product card for the featured rail + shop grid. Flat, 1px border, orange price. */
export function ProductCard({ product }: { product: ProductSummaryDTO }) {
  const outOfStock = product.stock <= 0;
  return (
    <Link
      to={`/product/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-border bg-surface transition-shadow hover:shadow-pop focus-visible:shadow-pop"
    >
      <div className="relative">
        <ImageWithFallback
          src={product.primaryImage?.url}
          alt={product.primaryImage?.altText ?? product.name}
          className="aspect-square"
        />
        {product.featured && (
          <Badge tone="accent" className="absolute left-3 top-3">
            Featured
          </Badge>
        )}
        {outOfStock && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-1 text-center text-label-sm font-semibold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {product.category && (
          <span className="text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
            {product.category.label}
          </span>
        )}
        <h3 className="mt-1 line-clamp-2 font-display text-body-md font-bold text-primary">
          {product.name}
        </h3>
        <div className="mt-auto flex items-end justify-between pt-3">
          <span className="text-headline-md font-bold text-accent">{formatPrice(product.price)}</span>
          <span className="flex h-9 w-9 items-center justify-center rounded bg-primary text-primary-fg transition-colors group-hover:bg-accent" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
