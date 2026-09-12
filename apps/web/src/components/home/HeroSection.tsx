import { Link } from 'react-router-dom';
import type { HomeHeroDTO } from '@tools-jamaica/shared';
import { ImageWithFallback } from '../ui/ImageWithFallback.js';

/**
 * The hero, driven by the singleton `home_hero` row. `hero` is null only until
 * the client seeds one (0010 seeds it with the original copy), so the block
 * simply doesn't render rather than showing a half-empty panel.
 */
export function HeroSection({ hero }: { hero: HomeHeroDTO | null }) {
  if (!hero) return null;

  return (
    <div className="relative aspect-[2.4/1] overflow-hidden rounded-card bg-surface-inverse lg:aspect-auto lg:h-[377px]">
      {hero.imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${hero.imageUrl})` }}
          aria-hidden="true"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-surface-inverse via-surface-inverse/90 to-surface-inverse/40" />
      <div className="relative flex h-full flex-col justify-center p-6 lg:p-10">
        {hero.eyebrow && (
          <p className="text-label-lg font-semibold uppercase tracking-widest text-accent">
            {hero.eyebrow}
          </p>
        )}
        <h1 className="mt-3 max-w-md font-display text-headline-lg leading-tight text-white lg:text-display-md">
          {hero.headline}
        </h1>
        {hero.subcopy && (
          <p className="mt-3 hidden max-w-md text-body-md text-white/80 lg:block">{hero.subcopy}</p>
        )}
        {hero.ctaLabel && (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to={hero.ctaHref}
              className="rounded bg-accent px-6 py-3 text-label-lg font-semibold text-accent-fg shadow-hard transition-colors hover:bg-accent-hover"
            >
              {hero.ctaLabel}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The two cards beside the hero. These used to render `categoryList[0]` and
 * `[1]`, so "In stock now" showed whatever photo sat on the second top-level
 * category — now each tile owns its own image and link.
 */
export function PromoTiles({
  tiles,
  shopNowLabel,
}: {
  tiles: { id: string; title: string; imageUrl: string | null; href: string | null }[];
  shopNowLabel: string;
}) {
  if (tiles.length === 0) return null;

  return (
    <div className="flex flex-col gap-gutter">
      {tiles.map((tile) => (
        <Link
          key={tile.id}
          to={tile.href ?? '/shop'}
          className="relative h-[140px] flex-1 overflow-hidden rounded-card lg:h-[179px] lg:flex-none"
        >
          <ImageWithFallback
            src={tile.imageUrl}
            alt=""
            className="h-full w-full"
            imgClassName="object-cover"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
          <span className="absolute inset-x-0 bottom-0 p-4">
            <span className="font-display text-headline-sm text-white">{tile.title}</span>
            <span className="mt-2 inline-block rounded bg-accent px-3 py-1 text-label-sm font-semibold text-accent-fg">
              {shopNowLabel}
            </span>
          </span>
        </Link>
      ))}
    </div>
  );
}
