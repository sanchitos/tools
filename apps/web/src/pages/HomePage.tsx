import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { whatsappUrl } from '../lib/contact.js';
import { Container, ImageWithFallback, Loader, Rail } from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';
import { HeroSection, PromoTiles } from '../components/home/HeroSection.js';
import { ServiceTiles } from '../components/home/ServiceTiles.js';
import { BrandRail } from '../components/home/BrandRail.js';
import { LocationsSection } from '../components/home/LocationsSection.js';
import { useT } from '../i18n/LocaleContext.js';

/**
 * The homepage is admin-editable: the hero, the two promo cards, the trust
 * tiles, the ticker, the featured-brand rail and the branch list all come from
 * `GET /home` (one payload — see catalog/homeService.ts). Nothing on this page
 * is hardcoded copy any more except its own section chrome, which is a
 * translation key.
 */
export default function HomePage() {
  const t = useT();
  const home = useAsync(() => api.home(), []);
  const categories = useAsync(() => api.categories(), []);
  const featured = useAsync(() => api.featured(), []);
  const newArrivals = useAsync(() => api.listProducts({ sort: 'name', pageSize: 12 }), []);

  // Home shows top-level departments only; a subcategory's products still
  // surface when its parent department is selected (server-side expansion).
  const categoryList = (categories.data ?? []).filter((c) => c.parentId === null);
  const ticker = home.data?.ticker ?? [];

  return (
    <>
      {/* Promo ticker */}
      {ticker.length > 0 && (
        <div className="h-10 overflow-hidden bg-accent text-accent-fg">
          <div className="flex h-full w-max animate-marquee items-center whitespace-nowrap motion-reduce:animate-none">
            {[...ticker, ...ticker].map((item, i) => (
              <span
                key={`${item.id}-${i}`}
                className="px-8 text-label-sm font-semibold uppercase tracking-wide"
              >
                {item.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Department circle rail */}
      <section className="border-b border-border bg-surface">
        <Container className="py-6">
          {categories.loading ? (
            <Loader />
          ) : (
            <Rail
              scrollLeftLabel={t('common.scrollLeft')}
              scrollRightLabel={t('common.scrollRight')}
            >
              {categoryList.map((c) => (
                <Link
                  key={c.id}
                  to={`/shop?category=${c.slug}`}
                  className="flex w-24 shrink-0 snap-start flex-col items-center gap-2 text-center"
                >
                  <span className="h-[72px] w-[72px] overflow-hidden rounded-full border-2 border-border bg-surface">
                    <ImageWithFallback src={c.imageUrl} alt="" className="h-full w-full" imgClassName="object-cover" />
                  </span>
                  <span className="line-clamp-2 text-label-xs text-ink">{c.label}</span>
                </Link>
              ))}
            </Rail>
          )}
        </Container>
      </section>

      {/* Hero row */}
      <section id="departments" className="scroll-mt-24">
        <Container className="py-8">
          {home.loading ? (
            <Loader />
          ) : (
            <div className="grid grid-cols-1 gap-gutter lg:grid-cols-[3fr_2fr]">
              <HeroSection hero={home.data?.hero ?? null} />
              <PromoTiles tiles={home.data?.promos ?? []} shopNowLabel={t('common.shopNow')} />
            </div>
          )}
        </Container>
      </section>

      {/* Services / trust row */}
      {(home.data?.services.length ?? 0) > 0 && (
        <section className="border-y border-border bg-surface-muted">
          <Container className="py-8">
            <ServiceTiles tiles={home.data?.services ?? []} />
          </Container>
        </section>
      )}

      {/* Featured rail */}
      <section>
        <Container className="py-14">
          {featured.loading ? (
            <Loader />
          ) : featured.error ? (
            <p className="text-error">{featured.error}</p>
          ) : (featured.data ?? []).length === 0 ? (
            <p className="text-center text-ink-muted">{t('home.noFeatured')}</p>
          ) : (
            <Rail
              title={t('home.featuredRail')}
              viewAllHref="/shop?sort=featured"
              viewAllLabel={t('common.viewAll')}
              scrollLeftLabel={t('common.scrollLeft')}
              scrollRightLabel={t('common.scrollRight')}
            >
              {(featured.data ?? []).map((p) => (
                <div key={p.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </Rail>
          )}
        </Container>
      </section>

      {/* Featured brands */}
      {(home.data?.featuredBrands.length ?? 0) > 0 && (
        <section className="border-t border-border bg-surface-muted">
          <Container className="py-12">
            <BrandRail
              brands={home.data?.featuredBrands ?? []}
              title={t('home.topBrands')}
              scrollLeftLabel={t('common.scrollLeft')}
              scrollRightLabel={t('common.scrollRight')}
            />
          </Container>
        </section>
      )}

      {/* Banner strip */}
      <section>
        <Container className="py-14">
          <div className="flex flex-col items-start gap-4 rounded-card bg-primary p-8 text-primary-fg sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-headline-md">{t('home.needItToday')}</h2>
              <p className="mt-1 text-body-md text-primary-fg/80">{t('home.needItTodaySub')}</p>
            </div>
            <a
              href={whatsappUrl(t('whatsapp.defaultMessage'))}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded bg-accent px-6 py-3 text-label-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              {t('common.whatsappUs')}
            </a>
          </div>
        </Container>
      </section>

      {/* Departments grid */}
      <section>
        <Container className="pb-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-headline-lg text-primary">{t('home.shopByDepartment')}</h2>
            <Link to="/shop" className="hidden text-label-lg font-semibold text-primary hover:text-accent sm:inline">
              {t('common.viewAll')}
            </Link>
          </div>
          {categories.loading ? (
            <Loader />
          ) : categories.error ? (
            <p className="text-error">{categories.error}</p>
          ) : (
            <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
              {categoryList.map((c) => (
                <Link
                  key={c.id}
                  to={`/shop?category=${c.slug}`}
                  className="group relative block aspect-square overflow-hidden rounded-card border border-border"
                >
                  <ImageWithFallback src={c.imageUrl} alt={c.label} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-3">
                    <span className="line-clamp-2 text-label-sm font-bold text-white">{c.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* New arrivals rail */}
      <section className="border-t border-border bg-surface-muted">
        <Container className="py-14">
          {newArrivals.loading ? (
            <Loader />
          ) : newArrivals.error ? (
            <p className="text-error">{newArrivals.error}</p>
          ) : (newArrivals.data?.items ?? []).length === 0 ? (
            <p className="text-center text-ink-muted">{t('home.noProducts')}</p>
          ) : (
            <Rail
              title={t('home.catalogRail')}
              viewAllHref="/shop"
              viewAllLabel={t('common.viewAll')}
              scrollLeftLabel={t('common.scrollLeft')}
              scrollRightLabel={t('common.scrollRight')}
            >
              {(newArrivals.data?.items ?? []).map((p) => (
                <div key={p.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </Rail>
          )}
        </Container>
      </section>

      {/* Locations */}
      {(home.data?.locations.length ?? 0) > 0 && (
        <section className="border-t border-border">
          <Container className="py-14">
            <LocationsSection
              locations={home.data?.locations ?? []}
              labels={{
                heading: t('home.visitUs'),
                sub: t('home.visitUsSub'),
                directions: t('home.getDirections'),
              }}
            />
          </Container>
        </section>
      )}

      {/* CTA band */}
      <section className="bg-surface-inverse">
        <Container className="flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-headline-lg text-white">{t('home.ctaHeading')}</h2>
            <p className="mt-2 text-body-lg text-white/70">{t('home.ctaSub')}</p>
          </div>
          <Link
            to="/shop"
            className="shrink-0 rounded bg-accent px-8 py-4 text-label-lg font-semibold text-accent-fg transition-transform hover:scale-105"
          >
            {t('common.shopNow')}
          </Link>
        </Container>
      </section>
    </>
  );
}
