import { Link, NavLink } from 'react-router-dom';
import { Container } from './ui/Container.js';
import { PHONE_DISPLAY, PHONE_TEL } from '../lib/contact.js';

const navLink = ({ isActive }: { isActive: boolean }) =>
  `pb-1 text-label-lg font-semibold uppercase tracking-wide transition-colors ${
    isActive
      ? 'border-b-2 border-accent text-primary'
      : 'text-ink-muted hover:text-primary'
  }`;

/** Public site header: slim navy utility bar + sticky main nav. */
export function Header() {
  return (
    <header className="sticky top-0 z-40">
      {/* Utility bar */}
      <div className="bg-primary text-primary-fg">
        <Container className="flex h-9 items-center justify-between text-label-sm">
          <span className="uppercase tracking-wide">Tools, Hardware &amp; Supplies — Jamaica</span>
          <a href={`tel:${PHONE_TEL}`} className="hidden hover:text-accent sm:inline">
            Call us: {PHONE_DISPLAY}
          </a>
        </Container>
      </div>

      {/* Main nav */}
      <div className="border-b border-border bg-surface">
        <Container className="flex h-16 items-center justify-between">
          <Link to="/" className="flex items-baseline gap-1 font-display text-headline-md font-bold">
            <span className="text-primary">TOOLS</span>
            <span className="text-accent">JAMAICA</span>
          </Link>
          <nav className="flex items-center gap-8">
            <NavLink to="/" end className={navLink}>
              Home
            </NavLink>
            <NavLink to="/shop" className={navLink}>
              Shop
            </NavLink>
          </nav>
        </Container>
      </div>
    </header>
  );
}
