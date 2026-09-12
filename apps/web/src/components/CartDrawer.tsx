import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.js';
import { Drawer } from './ui/Drawer.js';
import { ImageWithFallback } from './ui/ImageWithFallback.js';
import { Icon } from './ui/Icon.js';
import { formatPrice } from '../lib/format.js';
import { useT } from '../i18n/LocaleContext.js';

/** Cart drawer — rendered once in PublicLayout, driven by CartContext. */
export function CartDrawer() {
  const t = useT();
  const { lines, subtotal, setQty, remove, isOpen, close } = useCart();
  const location = useLocation();
  const navigate = useNavigate();

  // Deliberately only depends on the path: `close` is stable (useCallback) and
  // including it would just be noise.
  useEffect(() => {
    close();
  }, [location.pathname, close]);

  const goCheckout = () => {
    close();
    navigate('/checkout');
  };

  return (
    <Drawer
      open={isOpen}
      side="right"
      title={t('cart.title')}
      closeLabel={t('common.close')}
      onClose={close}
      footer={
        lines.length > 0 ? (
          <div>
            <div className="flex items-center justify-between text-body-md font-semibold text-ink">
              <span>{t('common.subtotal')}</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <p className="mt-1 text-label-sm text-ink-muted">{t('common.deliveryQuoted')}</p>
            <button
              onClick={goCheckout}
              className="mt-3 flex w-full items-center justify-center rounded bg-primary py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
            >
              {t('cart.checkout')}
            </button>
            <Link
              to="/cart"
              onClick={close}
              className="mt-2 flex w-full items-center justify-center rounded border-2 border-primary py-2.5 text-label-lg font-semibold text-primary hover:bg-surface-muted"
            >
              {t('cart.viewCart')}
            </Link>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
          <Icon name="cart" className="text-5xl text-ink-muted" />
          <p className="text-body-md text-ink-muted">{t('cart.empty')}</p>
          <Link
            to="/shop"
            onClick={close}
            className="mt-2 rounded bg-primary px-6 py-2.5 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
          >
            {t('common.shopProducts')}
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-border px-4">
          {lines.map((line) => (
            <li key={line.productId} className="flex gap-3 py-4">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded border border-border">
                <ImageWithFallback src={line.imageUrl} alt="" className="h-full w-full" imgClassName="object-contain" />
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/product/${line.slug}`}
                    onClick={close}
                    className="line-clamp-2 text-body-sm font-semibold text-ink hover:text-primary"
                  >
                    {line.name}
                  </Link>
                  <button
                    onClick={() => remove(line.productId)}
                    aria-label={t('common.removeItem', { name: line.name })}
                    className="shrink-0 text-ink-muted hover:text-error"
                  >
                    <Icon name="close" />
                  </button>
                </div>
                <span className="mt-1 text-label-sm text-ink-muted">{formatPrice(line.price)}</span>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 rounded border border-border">
                    <button
                      onClick={() => setQty(line.productId, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label={t('common.decreaseQuantity')}
                      className="px-2 py-1 text-ink disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-4 text-center text-body-sm">{line.quantity}</span>
                    <button
                      onClick={() => setQty(line.productId, line.quantity + 1)}
                      aria-label={t('common.increaseQuantity')}
                      className="px-2 py-1 text-ink"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-body-sm font-bold text-accent">
                    {formatPrice(line.price * line.quantity)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
