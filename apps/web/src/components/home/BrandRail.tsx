import { Link } from 'react-router-dom';
import type { BrandDTO } from '@tools-jamaica/shared';
import { Rail } from '../ui/Rail.js';
import { ImageWithFallback } from '../ui/ImageWithFallback.js';

/**
 * Featured brands (`brands.is_featured`). Brand names are proper nouns and are
 * never translated, so nothing here is locale-dependent except the rail chrome.
 */
export function BrandRail({
  brands,
  title,
  scrollLeftLabel,
  scrollRightLabel,
}: {
  brands: BrandDTO[];
  title: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
}) {
  if (brands.length === 0) return null;

  return (
    <Rail title={title} scrollLeftLabel={scrollLeftLabel} scrollRightLabel={scrollRightLabel}>
      {brands.map((brand) => (
        <Link
          key={brand.id}
          to={`/shop?brand=${brand.slug}`}
          className="flex h-24 w-[160px] shrink-0 snap-start items-center justify-center rounded-card border border-border bg-surface p-4 transition-shadow hover:shadow-card"
        >
          {brand.logoUrl ? (
            <ImageWithFallback
              src={brand.logoUrl}
              alt={brand.name}
              className="h-full w-full"
              imgClassName="object-contain"
            />
          ) : (
            <span className="text-body-sm font-semibold text-ink-muted">{brand.name}</span>
          )}
        </Link>
      ))}
    </Rail>
  );
}
