import { Link } from 'react-router-dom';
import { Container } from './ui/Container.js';
import { Icon } from './ui/Icon.js';
import { useAsync } from '../lib/useAsync.js';
import { api } from '../lib/api.js';
import { PHONE_DISPLAY, WHATSAPP_URL } from '../lib/contact.js';

/** Footer: contact band, six-column link grid, orange top rule + copyright bar. */
export function Footer() {
  const { data: categories } = useAsync(() => api.categories(), []);
  const topDepartments = (categories ?? []).slice(0, 5);

  return (
    <footer className="border-t-4 border-accent">
      {/* Contact band */}
      <div className="bg-surface-muted">
        <Container className="flex flex-col items-center gap-4 py-8 sm:flex-row sm:justify-between">
          <Link to="/" className="flex items-baseline gap-1 font-display text-headline-md font-bold">
            <span className="text-primary">TOOLS</span>
            <span className="text-accent">JAMAICA</span>
          </Link>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <span className="text-body-md text-ink-muted">Questions? We reply on WhatsApp.</span>
            <div className="flex gap-3">
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-label-sm font-semibold text-accent-fg hover:bg-accent-hover"
              >
                <Icon name="whatsapp" />
                WhatsApp us
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded border-2 border-primary px-4 py-2 text-label-sm font-semibold text-primary hover:bg-surface-strong"
              >
                <Icon name="whatsapp" />
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </Container>
      </div>

      {/* Link grid */}
      <div className="bg-primary text-primary-fg">
        <Container className="grid grid-cols-2 gap-8 py-12 md:grid-cols-3 lg:grid-cols-6">
          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Shop</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li><Link to="/shop" className="hover:text-accent">All products</Link></li>
              <li><Link to="/shop?sort=featured" className="hover:text-accent">Featured</Link></li>
              <li><Link to="/shop?inStock=true" className="hover:text-accent">In stock</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Departments</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              {topDepartments.length === 0 ? (
                <li><Link to="/shop" className="hover:text-accent">Browse all</Link></li>
              ) : (
                topDepartments.map((c) => (
                  <li key={c.id}>
                    <Link to={`/shop?category=${c.slug}`} className="hover:text-accent">
                      {c.label}
                    </Link>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Company</h3>
            <p className="mt-4 max-w-xs text-body-md text-primary-fg/70">
              Tools Jamaica supplies quality hardware and home-improvement products to contractors and
              DIY builders across the island.
            </p>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Help</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  WhatsApp us
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Contact</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li>Kingston, Jamaica</li>
              <li>Islandwide delivery</li>
              <li>Mon–Sat 8am–5pm</li>
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Admin</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li><Link to="/admin" className="hover:text-accent">Back office</Link></li>
            </ul>
          </div>
        </Container>
      </div>

      <div className="bg-primary">
        <div className="border-t border-primary-fg/15">
          <Container className="py-5 text-label-sm text-primary-fg/60">
            © {new Date().getFullYear()} Tools Jamaica. All rights reserved.
          </Container>
        </div>
      </div>
    </footer>
  );
}
