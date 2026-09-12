import { Link } from 'react-router-dom';
import { Container } from './ui/Container.js';
import { Icon } from './ui/Icon.js';
import { Logo } from './Logo.js';
import { useAsync } from '../lib/useAsync.js';
import { api } from '../lib/api.js';
import { PHONE_DISPLAY, whatsappUrl } from '../lib/contact.js';
import { useT } from '../i18n/LocaleContext.js';

/** Footer: contact band, six-column link grid, orange top rule + copyright bar. */
export function Footer() {
  const t = useT();
  const waUrl = whatsappUrl(t('whatsapp.defaultMessage'));
  const { data: categories } = useAsync(() => api.categories(), []);
  // Its own small endpoint, not GET /home: the footer renders on every page and
  // must not pull the whole homepage payload to show three addresses.
  const { data: locations } = useAsync(() => api.locations(), []);
  const topDepartments = (categories ?? []).slice(0, 5);

  return (
    <footer className="border-t-4 border-accent">
      {/* Contact band */}
      <div className="bg-surface-muted">
        <Container className="flex flex-col items-center gap-4 py-8 sm:flex-row sm:justify-between">
          <Link to="/" className="flex items-center" aria-label={t('nav.homeAria')}>
            <Logo />
          </Link>
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-4">
            <span className="text-body-md text-ink-muted">{t('footer.questions')}</span>
            <div className="flex gap-3">
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded bg-accent px-4 py-2 text-label-sm font-semibold text-accent-fg hover:bg-accent-hover"
              >
                <Icon name="whatsapp" />
                {t('common.whatsappUs')}
              </a>
              <a
                href={waUrl}
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
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">{t('footer.shop')}</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li><Link to="/shop" className="hover:text-accent">{t('footer.allProducts')}</Link></li>
              <li><Link to="/shop?sort=featured" className="hover:text-accent">{t('footer.featured')}</Link></li>
              <li><Link to="/shop?inStock=true" className="hover:text-accent">{t('footer.inStock')}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">{t('footer.departments')}</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              {topDepartments.length === 0 ? (
                <li><Link to="/shop" className="hover:text-accent">{t('footer.browseAll')}</Link></li>
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
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">{t('footer.company')}</h3>
            <p className="mt-4 max-w-xs text-body-md text-primary-fg/70">
              {t('footer.companyBlurb')}
            </p>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">{t('footer.help')}</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li>
                <a href={waUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
                  {t('common.whatsappUs')}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">
              {t('footer.locations')}
            </h3>
            <ul className="mt-4 space-y-3 text-body-md text-primary-fg/80">
              {(locations ?? []).map((loc) => (
                <li key={loc.id}>
                  <span className="block font-semibold text-primary-fg">{loc.name}</span>
                  <span className="block text-label-sm">{loc.address}</span>
                  {loc.hours && <span className="block text-label-sm">{loc.hours}</span>}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">{t('footer.admin')}</h3>
            <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
              <li><Link to="/admin" className="hover:text-accent">{t('footer.backOffice')}</Link></li>
            </ul>
          </div>
        </Container>
      </div>

      <div className="bg-primary">
        <div className="border-t border-primary-fg/15">
          <Container className="py-5 text-label-sm text-primary-fg/60">
            {t('footer.rights', { year: new Date().getFullYear() })}
          </Container>
        </div>
      </div>
    </footer>
  );
}
