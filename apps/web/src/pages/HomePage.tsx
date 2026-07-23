import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { Container, ImageWithFallback, Loader } from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';

const TRUST = [
  { title: 'Best Prices', body: 'Competitive pricing across every department, every day.' },
  { title: 'Widest Variety', body: 'From doors to tiles to sanitary ware — all in one place.' },
  { title: 'Top Brands', body: 'Quality hardware and supplies you can build on.' },
];

export default function HomePage() {
  const categories = useAsync(() => api.categories(), []);
  const featured = useAsync(() => api.featured(), []);

  return (
    <>
      {/* Hero */}
      <section className="relative bg-surface-inverse">
        {/* Background photo — swap apps/web/public/hero.jpg to change it. */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: 'url(/hero.jpg)' }}
          aria-hidden="true"
        />
        {/* Dark gradient overlay keeps the headline legible over the photo. */}
        <div className="absolute inset-0 bg-gradient-to-r from-surface-inverse via-surface-inverse/90 to-surface-inverse/40" />
        <Container className="relative py-24 lg:py-32">
          <p className="text-label-lg font-semibold uppercase tracking-widest text-accent">
            Tools, Hardware &amp; Supplies
          </p>
          <h1 className="mt-4 max-w-3xl font-display text-display-lg leading-tight text-white">
            Your one-stop shop for every home-improvement project.
          </h1>
          <p className="mt-5 max-w-xl text-body-lg text-white/80">
            Professional-grade doors, faucets, flooring, tiles and more — sourced for
            contractors and DIY builders across Jamaica.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              to="/shop"
              className="rounded bg-accent px-8 py-4 text-label-lg font-semibold text-accent-fg shadow-hard transition-colors hover:bg-accent-hover"
            >
              Shop the catalog
            </Link>
            <a
              href="#departments"
              className="rounded border-2 border-white/60 px-8 py-4 text-label-lg font-semibold text-white transition-colors hover:bg-white hover:text-primary"
            >
              Browse departments
            </a>
          </div>
        </Container>
      </section>

      {/* Trust bar */}
      <section className="bg-primary">
        <Container className="grid grid-cols-1 gap-8 py-12 sm:grid-cols-3">
          {TRUST.map((t) => (
            <div key={t.title} className="flex items-start gap-4 text-primary-fg">
              <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded bg-accent text-accent-fg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </span>
              <div>
                <h3 className="text-headline-md">{t.title}</h3>
                <p className="mt-1 text-body-md text-primary-fg/70">{t.body}</p>
              </div>
            </div>
          ))}
        </Container>
      </section>

      {/* Departments */}
      <section id="departments" className="scroll-mt-24">
        <Container className="py-20">
          <div className="mb-8 flex items-end justify-between">
            <div>
              <h2 className="font-display text-headline-lg text-primary">Shop by department</h2>
              <p className="mt-2 text-body-md text-ink-muted">Find exactly what your project needs.</p>
            </div>
            <Link to="/shop" className="hidden text-label-lg font-semibold text-primary hover:text-accent sm:inline">
              View all →
            </Link>
          </div>

          {categories.loading ? (
            <Loader />
          ) : categories.error ? (
            <p className="text-error">{categories.error}</p>
          ) : (
            <div className="grid grid-cols-2 gap-gutter md:grid-cols-3 lg:grid-cols-4">
              {(categories.data ?? []).map((c) => (
                <Link
                  key={c.id}
                  to={`/shop?category=${c.slug}`}
                  className="group relative block aspect-[4/3] overflow-hidden rounded-card border border-border"
                >
                  <ImageWithFallback src={c.imageUrl} alt={c.label} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
                  <span className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    <span className="font-display text-headline-md text-white">{c.label}</span>
                    {typeof c.productCount === 'number' && (
                      <span className="mt-0.5 block text-label-sm text-white/70">
                        {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                      </span>
                    )}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Container>
      </section>

      {/* Featured */}
      <section className="border-y border-border bg-surface-muted">
        <Container className="py-20">
          <div className="mb-8 flex items-end justify-between">
            <h2 className="font-display text-headline-lg uppercase tracking-tight text-primary">
              Featured products
            </h2>
            <Link to="/shop" className="text-label-lg font-semibold text-primary hover:text-accent">
              View all →
            </Link>
          </div>
          {featured.loading ? (
            <Loader />
          ) : featured.error ? (
            <p className="text-error">{featured.error}</p>
          ) : (featured.data ?? []).length === 0 ? (
            <p className="text-ink-muted">No featured products yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
              {(featured.data ?? []).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
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
