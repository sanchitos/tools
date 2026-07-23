import { Link } from 'react-router-dom';
import { Container } from './ui/Container.js';

/** Navy footer with an orange top rule, matching the Stitch design. */
export function Footer() {
  return (
    <footer className="border-t-4 border-accent bg-primary text-primary-fg">
      <Container className="grid grid-cols-1 gap-8 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-baseline gap-1 font-display text-headline-md font-bold">
            <span className="text-white">TOOLS</span>
            <span className="text-accent">JAMAICA</span>
          </div>
          <p className="mt-3 max-w-xs text-body-md text-primary-fg/70">
            Your one-stop shop for tools, hardware &amp; home-improvement supplies across Jamaica.
          </p>
        </div>

        <div>
          <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Shop</h3>
          <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
            <li><Link to="/shop" className="hover:text-accent">All products</Link></li>
            <li><Link to="/shop?sort=featured" className="hover:text-accent">Featured</Link></li>
            <li><Link to="/shop?category=sale" className="hover:text-accent">On sale</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Company</h3>
          <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
            <li><span className="cursor-default">About us</span></li>
            <li><span className="cursor-default">Store locations</span></li>
            <li><span className="cursor-default">Contact</span></li>
          </ul>
        </div>

        <div>
          <h3 className="text-label-lg font-semibold uppercase tracking-wide text-accent">Admin</h3>
          <ul className="mt-4 space-y-2 text-body-md text-primary-fg/80">
            <li><Link to="/admin" className="hover:text-accent">Back office</Link></li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-primary-fg/15">
        <Container className="py-5 text-label-sm text-primary-fg/60">
          © {new Date().getFullYear()} Tools Jamaica. All rights reserved.
        </Container>
      </div>
    </footer>
  );
}
