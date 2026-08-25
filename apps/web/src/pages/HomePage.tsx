import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { WHATSAPP_URL } from '../lib/contact.js';
import { Container, ImageWithFallback, Loader, Rail, Icon } from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';

const TICKER = [
  'Islandwide delivery',
  'Trade pricing available — ask us',
  'Genuine brands only',
  'Call or WhatsApp for same-day quotes',
];

const SERVICES = [
  { icon: 'truck' as const, title: 'Islandwide delivery', body: 'We deliver to every parish, fast.' },
  { icon: 'shield' as const, title: 'Genuine brands', body: 'Quality hardware you can build on.' },
  { icon: 'tag' as const, title: 'Trade pricing', body: 'Ask about pricing for contractors.' },
  { icon: 'headset' as const, title: 'Real support', body: 'Call or WhatsApp — a person answers.' },
];

export default function HomePage() {
  const categories = useAsync(() => api.categories(), []);
  const featured = useAsync(() => api.featured(), []);
  const newArrivals = useAsync(() => api.listProducts({ sort: 'name', pageSize: 12 }), []);

  const categoryList = categories.data ?? [];
  const [promoA, promoB] = categoryList;

  return (
    <>
      {/* Promo ticker */}
      <div className="h-10 overflow-hidden bg-accent text-accent-fg">
        <div className="flex h-full w-max animate-marquee items-center whitespace-nowrap motion-reduce:animate-none">
          {[...TICKER, ...TICKER].map((t, i) => (
            <span key={i} className="px-8 text-label-sm font-semibold uppercase tracking-wide">
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Department circle rail */}
      <section className="border-b border-border bg-surface">
        <Container className="py-6">
          {categories.loading ? (
            <Loader />
          ) : (
            <Rail>
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
          <div className="grid grid-cols-1 gap-gutter lg:grid-cols-[3fr_2fr]">
            <div className="relative aspect-[2.4/1] overflow-hidden rounded-card bg-surface-inverse lg:aspect-auto lg:h-[377px]">
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: 'url(/hero.jpg)' }}
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-surface-inverse via-surface-inverse/90 to-surface-inverse/40" />
              <div className="relative flex h-full flex-col justify-center p-6 lg:p-10">
                <p className="text-label-lg font-semibold uppercase tracking-widest text-accent">
                  Tools, Hardware &amp; Supplies
                </p>
                <h1 className="mt-3 max-w-md font-display text-headline-lg leading-tight text-white lg:text-display-md">
                  Your one-stop shop for every home-improvement project.
                </h1>
                <p className="mt-3 hidden max-w-md text-body-md text-white/80 lg:block">
                  Professional-grade doors, faucets, flooring, tiles and more — sourced for contractors
                  and DIY builders across Jamaica.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    to="/shop"
                    className="rounded bg-accent px-6 py-3 text-label-lg font-semibold text-accent-fg shadow-hard transition-colors hover:bg-accent-hover"
                  >
                    Shop the catalog
                  </Link>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-gutter">
              {[
                { c: promoA, href: '/shop?sort=featured', label: 'Featured picks' },
                { c: promoB, href: '/shop?inStock=true', label: 'In stock now' },
              ].map(({ c, href, label }, i) => (
                <Link
                  key={i}
                  to={href}
                  className="relative h-[140px] flex-1 overflow-hidden rounded-card lg:h-[179px] lg:flex-none"
                >
                  <ImageWithFallback src={c?.imageUrl} alt="" className="h-full w-full" imgClassName="object-cover" />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    <span className="font-display text-headline-sm text-white">{label}</span>
                    <span className="mt-2 inline-block rounded bg-accent px-3 py-1 text-label-sm font-semibold text-accent-fg">
                      Shop now
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* Services / trust row */}
      <section className="border-y border-border bg-surface-muted">
        <Container className="grid grid-cols-2 gap-6 py-8 lg:grid-cols-4">
          {SERVICES.map((s) => (
            <div key={s.title} className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent text-accent-fg">
                <Icon name={s.icon} className="text-xl" />
              </span>
              <div>
                <h3 className="text-body-sm font-bold text-ink">{s.title}</h3>
                <p className="mt-0.5 text-label-sm text-ink-muted">{s.body}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      {/* Featured rail */}
      <section>
        <Container className="py-14">
          {featured.loading ? (
            <Loader />
          ) : featured.error ? (
            <p className="text-error">{featured.error}</p>
          ) : (featured.data ?? []).length === 0 ? (
            <p className="text-center text-ink-muted">No featured products yet.</p>
          ) : (
            <Rail title="Featured this week" viewAllHref="/shop?sort=featured">
              {(featured.data ?? []).map((p) => (
                <div key={p.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </Rail>
          )}
        </Container>
      </section>

      {/* Banner strip */}
      <section>
        <Container className="pb-14">
          <div className="flex flex-col items-start gap-4 rounded-card bg-primary p-8 text-primary-fg sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-headline-md">Need it today?</h2>
              <p className="mt-1 text-body-md text-primary-fg/80">Message us on WhatsApp for fast quotes.</p>
            </div>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded bg-accent px-6 py-3 text-label-lg font-semibold text-accent-fg transition-colors hover:bg-accent-hover"
            >
              WhatsApp us
            </a>
          </div>
        </Container>
      </section>

      {/* Departments grid */}
      <section>
        <Container className="pb-14">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-headline-lg text-primary">Shop by department</h2>
            <Link to="/shop" className="hidden text-label-lg font-semibold text-primary hover:text-accent sm:inline">
              View all →
            </Link>
          </div>
          {categories.loading ? (
            <Loader />
          ) : categories.error ? (
            <p className="text-error">{categories.error}</p>
          ) : (
            <div className="grid grid-cols-2 gap-gutter md:grid-cols-4 lg:grid-cols-6">
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
            <p className="text-center text-ink-muted">No products yet.</p>
          ) : (
            <Rail title="More from the catalog" viewAllHref="/shop">
              {(newArrivals.data?.items ?? []).map((p) => (
                <div key={p.id} className="w-[220px] shrink-0 snap-start">
                  <ProductCard product={p} />
                </div>
              ))}
            </Rail>
          )}
        </Container>
      </section>

      {/* CTA band */}
      <section className="bg-surface-inverse">
        <Container className="flex flex-col items-start gap-6 py-16 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-headline-lg text-white">Ready to start your next project?</h2>
            <p className="mt-2 text-body-lg text-white/70">Browse the full catalog and build with confidence.</p>
          </div>
          <Link
            to="/shop"
            className="shrink-0 rounded bg-accent px-8 py-4 text-label-lg font-semibold text-accent-fg transition-transform hover:scale-105"
          >
            Shop now
          </Link>
        </Container>
      </section>
    </>
  );
}
