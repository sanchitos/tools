import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Container } from './ui/Container.js';
import { Icon } from './ui/Icon.js';
import { IconButton } from './ui/IconButton.js';
import { DepartmentDrawer } from './DepartmentDrawer.js';
import { Logo } from './Logo.js';
import { PHONE_DISPLAY, whatsappUrl } from '../lib/contact.js';
import { useCart } from '../context/CartContext.js';
import { LocaleSwitcher } from './LocaleSwitcher.js';
import { useT } from '../i18n/LocaleContext.js';

/** Public site header: three sticky tiers (utility / brand+search / promo). */
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const { count, open: openCart } = useCart();
  const t = useT();
  const waUrl = whatsappUrl(t('whatsapp.defaultMessage'));

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = searchValue.trim();
    navigate(q ? `/shop?q=${encodeURIComponent(q)}` : '/shop');
  };

  const searchInput = (
    <form onSubmit={submitSearch} className="flex w-full">
      <input
        type="search"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder={t('nav.searchPlaceholder')}
        aria-label={t('nav.searchAria')}
        className="w-full rounded-l border-0 bg-surface px-3 py-2 text-body-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-accent"
      />
      <button
        type="submit"
        aria-label={t('nav.searchSubmit')}
        className="flex shrink-0 items-center justify-center rounded-r bg-accent px-4 text-accent-fg transition-colors hover:bg-accent-hover"
      >
        <Icon name="search" className="text-xl" />
      </button>
    </form>
  );

  return (
    <header className="sticky top-0 z-40">
      {/* Tier 1 — utility bar */}
      <div className="hidden bg-primary-dark text-primary-fg sm:block">
        <Container className="flex h-9 items-center justify-between text-label-sm">
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-accent"
          >
            <Icon name="whatsapp" />
            {PHONE_DISPLAY}
          </a>
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="uppercase tracking-wide hover:text-accent"
          >
            {t('nav.tagline')}
          </a>
        </Container>
      </div>

      {/* Tier 2 — brand bar */}
      <div className="bg-primary text-primary-fg">
        <Container className="flex h-16 items-center gap-3 lg:h-[74px]">
          <IconButton
            icon="menu"
            label={t('nav.allDepartments')}
            onClick={() => setMenuOpen(true)}
            className="shrink-0 text-primary-fg hover:bg-primary-dark"
          />

          <Link to="/" className="flex shrink-0 items-center" aria-label={t('nav.homeAria')}>
            <Logo />
          </Link>

          <div className="mx-4 hidden max-w-[580px] flex-1 md:flex">{searchInput}</div>

          <nav className="ml-auto flex items-center gap-4 lg:gap-6">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1.5 text-label-sm font-semibold hover:text-accent lg:flex"
            >
              <Icon name="whatsapp" className="text-lg" />
              {t('nav.whatsapp')}
            </a>
            <Link
              to="/admin"
              className="flex items-center gap-1.5 text-label-sm font-semibold hover:text-accent"
            >
              <Icon name="user" className="text-xl" />
              <span className="hidden lg:inline">{t('nav.admin')}</span>
            </Link>
            <button
              type="button"
              onClick={openCart}
              aria-label={t(count === 1 ? 'nav.cartAria_one' : 'nav.cartAria_other', { count })}
              className="relative flex items-center gap-1.5 text-label-sm font-semibold hover:text-accent"
            >
              <span className="relative">
                <Icon name="cart" className="text-xl" />
                {count > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-label-xs text-accent-fg">
                    {count}
                  </span>
                )}
              </span>
              <span className="hidden lg:inline">{t('common.cart')}</span>
            </button>
          </nav>
        </Container>

        {/* Mobile search row */}
        <div className="px-4 pb-3 md:hidden">{searchInput}</div>
      </div>

      {/* Tier 3 — promo bar */}
      <div className="hidden border-b border-border bg-surface-muted lg:flex">
        <Container className="flex h-11 items-center justify-between">
          <span className="flex items-center gap-1.5 text-body-xs text-ink-muted">
            <Icon name="pin" />
            {t('nav.location')}
          </span>
          <nav className="flex items-center gap-4 text-label-sm">
            <Link to="/shop?sort=featured" className="rounded bg-accent px-3 py-1 text-accent-fg">
              {t('nav.featured')}
            </Link>
            <Link to="/shop?inStock=true" className="text-ink-muted hover:text-primary">
              {t('nav.inStock')}
            </Link>
            <Link to="/shop" className="text-ink-muted hover:text-primary">
              {t('nav.topBrands')}
            </Link>
            <Link to="/shop" className="text-ink-muted hover:text-primary">
              {t('nav.shopAll')}
            </Link>
            <LocaleSwitcher className="ml-2" />
          </nav>
        </Container>
      </div>

      <DepartmentDrawer open={menuOpen} onClose={() => setMenuOpen(false)} />
    </header>
  );
}
