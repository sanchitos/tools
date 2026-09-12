import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext.js';
import {
  Breadcrumbs,
  Container,
  ConfirmDialog,
  Icon,
  ImageWithFallback,
} from '../components/ui/index.js';
import { formatPrice } from '../lib/format.js';
import { useT } from '../i18n/LocaleContext.js';

export default function CartPage() {
  const t = useT();
  const { lines, subtotal, setQty, remove, clear } = useCart();
  const [confirmClear, setConfirmClear] = useState(false);

  if (lines.length === 0) {
    return (
      <Container className="py-16">
        <Breadcrumbs items={[{ label: t('common.home'), to: '/' }, { label: t('common.cart') }]} />
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="cart" className="text-6xl text-ink-muted" />
          <h1 className="font-display text-headline-lg text-primary">{t('cart.empty')}</h1>
          <Link
            to="/shop"
            className="mt-2 rounded bg-primary px-6 py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
          >
            {t('common.shopProducts')}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-8">
      <Breadcrumbs items={[{ label: t('common.home'), to: '/' }, { label: t('common.cart') }]} />
      <div className="mt-2 flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">{t('cart.title')}</h1>
        <button
          onClick={() => setConfirmClear(true)}
          className="text-label-sm font-semibold text-error hover:underline"
        >
          {t('cart.clear')}
        </button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="divide-y divide-border rounded-card border border-border">
          {lines.map((line) => (
            <li key={line.productId} className="flex gap-4 p-4">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-border">
                <ImageWithFallback
                  src={line.imageUrl}
                  alt=""
                  className="h-full w-full"
                  imgClassName="object-contain"
                />
              </div>
              <div className="flex flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/product/${line.slug}`}
                    className="text-body-md font-semibold text-ink hover:text-primary"
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
                {line.sku && (
                  <span className="text-label-xs text-ink-muted">{t('common.sku', { sku: line.sku })}</span>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex h-9 items-center rounded border border-border">
                    <button
                      onClick={() => setQty(line.productId, line.quantity - 1)}
                      disabled={line.quantity <= 1}
                      aria-label={t('common.decreaseQuantity')}
                      className="h-full px-3 text-ink disabled:opacity-40"
                    >
                      −
                    </button>
                    <span className="min-w-6 text-center text-body-sm">{line.quantity}</span>
                    <button
                      onClick={() => setQty(line.productId, line.quantity + 1)}
                      aria-label={t('common.increaseQuantity')}
                      className="h-full px-3 text-ink"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-body-md font-bold text-accent">
                    {formatPrice(line.price * line.quantity)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="h-fit rounded-card border border-border p-4 shadow-card lg:sticky lg:top-24">
          <h2 className="text-headline-sm text-ink">{t('common.orderSummary')}</h2>
          <div className="mt-3 flex items-center justify-between text-body-md font-semibold text-ink">
            <span>{t('common.subtotal')}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-label-sm text-ink-muted">{t('common.deliveryQuoted')}</p>
          <Link
            to="/checkout"
            className="mt-4 flex w-full items-center justify-center rounded bg-primary py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
          >
            {t('cart.proceedToCheckout')}
          </Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title={t('cart.clearConfirmTitle')}
        message={t('cart.clearConfirmBody')}
        confirmLabel={t('cart.clear')}
        cancelLabel={t('cart.cancel')}
        busyLabel={t('cart.working')}
        danger
        onConfirm={() => {
          clear();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </Container>
  );
}
