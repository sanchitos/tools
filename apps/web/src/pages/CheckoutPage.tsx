import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { Fulfillment } from '@tools-jamaica/shared';
import { useCart } from '../context/CartContext.js';
import { useAuth } from '../context/AuthContext.js';
import { api, ApiError } from '../lib/api.js';
import { Breadcrumbs, Container, Input, Select } from '../components/ui/index.js';
import { formatPrice } from '../lib/format.js';
import { useT } from '../i18n/LocaleContext.js';

interface FormState {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillment: Fulfillment;
  deliveryAddress: string;
  notes: string;
}

const initialForm: FormState = {
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  fulfillment: 'pickup',
  deliveryAddress: '',
  notes: '',
};

export default function CheckoutPage() {
  const t = useT();
  const { lines, subtotal, clear } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Prefilled from the session when there is one, as the initial state rather
  // than an effect: /auth/me has already resolved by the time a shopper can
  // navigate here, and an effect would overwrite whatever they had typed.
  // Guest checkout is untouched — with no session these stay blank. The order
  // is stamped with user_id server-side either way (optionalAuth).
  const [form, setForm] = useState<FormState>(() =>
    user ? { ...initialForm, customerName: user.fullName ?? '', customerEmail: user.email } : initialForm,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  if (lines.length === 0) return <Navigate to="/cart" replace />;

  const fulfillmentOptions = [
    { value: 'pickup', label: t('checkout.pickup') },
    { value: 'delivery', label: t('checkout.delivery') },
  ];

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function validate(): boolean {
    const next: Partial<Record<keyof FormState, string>> = {};
    if (form.customerName.trim().length < 2) next.customerName = t('checkout.error.name');
    if (!/^[\d\s+()-]{7,20}$/.test(form.customerPhone.trim())) {
      next.customerPhone = t('checkout.error.phone');
    }
    if (form.customerEmail && !/^\S+@\S+\.\S+$/.test(form.customerEmail)) {
      next.customerEmail = t('checkout.error.email');
    }
    if (form.fulfillment === 'delivery' && !form.deliveryAddress.trim()) {
      next.deliveryAddress = t('checkout.error.address');
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setUnavailable([]);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const order = await api.createOrder({
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        customerEmail: form.customerEmail.trim() || undefined,
        fulfillment: form.fulfillment,
        deliveryAddress: form.fulfillment === 'delivery' ? form.deliveryAddress.trim() : undefined,
        notes: form.notes.trim() || undefined,
        items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      });
      clear();
      navigate(`/order/${order.orderNumber}`, { state: { order }, replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
        const details = err.details as { productIds?: string[] } | undefined;
        if (details?.productIds?.length) {
          const names = lines
            .filter((l) => details.productIds!.includes(l.productId))
            .map((l) => l.name);
          setUnavailable(names);
        }
      } else {
        setSubmitError(t('checkout.error.generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { label: t('common.home'), to: '/' },
          { label: t('common.cart'), to: '/cart' },
          { label: t('checkout.title') },
        ]}
      />
      <h1 className="mt-2 font-display text-headline-lg text-primary">{t('checkout.title')}</h1>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={onSubmit} className="space-y-5" noValidate>
          {submitError && (
            <div className="rounded-card border border-error/30 bg-error-container p-4 text-body-sm text-error-onContainer">
              <p>{submitError}</p>
              {unavailable.length > 0 && (
                <ul className="mt-2 list-disc pl-5">
                  {unavailable.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
              )}
              <Link className="mt-2 inline-block font-semibold underline" to="/cart">
                {t('checkout.backToCart')}
              </Link>
            </div>
          )}

          <div>
            <label className="text-label-sm font-semibold text-ink">{t('checkout.fullName')}</label>
            <Input
              className="mt-1"
              value={form.customerName}
              onChange={(e) => set('customerName', e.target.value)}
              placeholder={t('checkout.fullNamePlaceholder')}
            />
            {errors.customerName && <p className="mt-1 text-label-sm text-error">{errors.customerName}</p>}
          </div>

          <div>
            <label className="text-label-sm font-semibold text-ink">{t('checkout.phone')}</label>
            <Input
              className="mt-1"
              type="tel"
              value={form.customerPhone}
              onChange={(e) => set('customerPhone', e.target.value)}
              placeholder={t('checkout.phonePlaceholder')}
            />
            {errors.customerPhone && <p className="mt-1 text-label-sm text-error">{errors.customerPhone}</p>}
          </div>

          <div>
            <label className="text-label-sm font-semibold text-ink">{t('checkout.email')}</label>
            <Input
              className="mt-1"
              type="email"
              value={form.customerEmail}
              onChange={(e) => set('customerEmail', e.target.value)}
              placeholder={t('checkout.emailPlaceholder')}
            />
            {errors.customerEmail && <p className="mt-1 text-label-sm text-error">{errors.customerEmail}</p>}
          </div>

          <div>
            <label className="text-label-sm font-semibold text-ink">{t('checkout.fulfillment')}</label>
            <div className="mt-1">
              <Select
                ariaLabel={t('checkout.fulfillment')}
                value={form.fulfillment}
                options={fulfillmentOptions}
                onChange={(v) => set('fulfillment', v as Fulfillment)}
              />
            </div>
          </div>

          {form.fulfillment === 'delivery' && (
            <div>
              <label className="text-label-sm font-semibold text-ink">{t('checkout.address')}</label>
              <Input
                className="mt-1"
                value={form.deliveryAddress}
                onChange={(e) => set('deliveryAddress', e.target.value)}
                placeholder={t('checkout.addressPlaceholder')}
              />
              {errors.deliveryAddress && (
                <p className="mt-1 text-label-sm text-error">{errors.deliveryAddress}</p>
              )}
            </div>
          )}

          <div>
            <label className="text-label-sm font-semibold text-ink">{t('checkout.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={3}
              placeholder={t('checkout.notesPlaceholder')}
              className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-body-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center rounded bg-primary py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? t('checkout.placingOrder') : t('checkout.placeOrder')}
          </button>
        </form>

        <div className="h-fit rounded-card border border-border p-4 shadow-card lg:sticky lg:top-24">
          <h2 className="text-headline-sm text-ink">{t('common.orderSummary')}</h2>
          <ul className="mt-3 space-y-2">
            {lines.map((line) => (
              <li key={line.productId} className="flex justify-between text-body-sm text-ink-muted">
                <span className="line-clamp-1 pr-2">
                  {line.quantity}× {line.name}
                </span>
                <span className="shrink-0 text-ink">{formatPrice(line.price * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-body-md font-semibold text-ink">
            <span>{t('common.subtotal')}</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <p className="mt-1 text-label-sm text-ink-muted">{t('checkout.noPayment')}</p>
        </div>
      </div>
    </Container>
  );
}
