import { Link } from 'react-router-dom';
import type { ProductSummaryDTO } from '@tools-jamaica/shared';
import { ImageWithFallback } from './ui/ImageWithFallback.js';
import { Badge } from './ui/Badge.js';
import { Icon } from './ui/Icon.js';
import { Stars } from './ui/Stars.js';
import { formatPrice } from '../lib/format.js';
import { whatsappUrl } from '../lib/contact.js';

/**
 * Walmart-anatomy product card: image -> brand -> CTA -> price -> title -> rating -> meta.
 * The CTA sits above the price and the title below it, deliberately (see plan).
 */
export function ProductCard({ product }: { product: ProductSummaryDTO }) {
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= 5;

  const enquire = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock) return;
    const message = `Hi, I'm interested in ${product.name} (${product.sku ?? product.slug}).`;
    window.open(whatsappUrl(message), '_blank', 'noopener');
  };

  return (
    <Link
      to={`/product/${product.slug}`}
      className="group flex h-full flex-col rounded-card bg-surface p-3 pb-4 shadow-card transition-shadow hover:shadow-pop focus-visible:shadow-pop"
    >
      <div className="relative aspect-square">
        <ImageWithFallback
          src={product.primaryImage?.url}
          alt={product.primaryImage?.altText ?? product.name}
          className="h-full w-full"
          imgClassName="object-contain p-2"
        />
        {product.featured && (
          <Badge tone="accent" className="absolute left-2 top-2 text-label-xs">
            Featured
          </Badge>
        )}
        {!product.featured && lowStock && (
          <Badge tone="error" className="absolute left-2 top-2 text-label-xs">
            Low stock
          </Badge>
        )}
        {outOfStock && (
          <span className="absolute inset-x-0 bottom-0 bg-ink/80 py-1 text-center text-label-sm font-semibold uppercase tracking-wide text-white">
            Out of stock
          </span>
        )}
      </div>

      <span className="mt-3 text-body-xs font-semibold text-ink-muted">
        Sold by {product.brand?.name ?? 'Tools Jamaica'}
      </span>

      <button
        type="button"
        onClick={enquire}
        disabled={outOfStock}
        className="mt-2 inline-flex w-fit items-center gap-1 rounded bg-primary px-3 py-1.5 text-label-sm font-semibold text-primary-fg transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-60"
      >
        <Icon name="whatsapp" />
        Enquire
      </button>

      <span className="mt-2 text-headline-md font-bold text-accent">{formatPrice(product.price)}</span>

      <h3 className="mt-1 line-clamp-2 text-body-sm text-ink">{product.name}</h3>

      <div className="mt-1">
        <Stars rating={product.rating} count={product.reviewCount} size="sm" />
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-border pt-2 text-label-xs text-ink-muted">
        {product.sku ? <span>SKU: {product.sku}</span> : <span>{product.category?.label ?? ''}</span>}
      </div>
    </Link>
  );
}
