import { Link, useLocation, useParams } from 'react-router-dom';
import type { OrderDTO } from '@tools-jamaica/shared';
import { Container, Icon } from '../components/ui/index.js';
import { formatPrice } from '../lib/format.js';
import { whatsappUrl } from '../lib/contact.js';
import { useT } from '../i18n/LocaleContext.js';

export default function OrderConfirmationPage() {
  const t = useT();
  const { orderNumber = '' } = useParams();
  const location = useLocation();
  const order = (location.state as { order?: OrderDTO } | null)?.order;

  // Order numbers are sequential and there is deliberately no public GET
  // /orders/:id (see apps/api/src/modules/orders/routes.ts) — a refresh or a
  // shared link loses the order detail. Fall back to a WhatsApp pointer
  // instead of trying to fetch it.
  if (!order) {
    return (
      <Container className="py-16 text-center">
        <Icon name="check" className="mx-auto text-6xl text-success" />
        <h1 className="mt-4 font-display text-headline-lg text-primary">
          {t('order.received', { number: orderNumber })}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-body-md text-ink-muted">{t('order.onFile')}</p>
        <a
          href={whatsappUrl(t('order.followUpMessage', { number: orderNumber }))}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded bg-primary px-6 py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
        >
          <Icon name="whatsapp" />
          {t('order.sendWhatsapp')}
        </a>
        <div className="mt-4">
          <Link to="/shop" className="text-label-sm font-semibold text-primary hover:underline">
            {t('order.continueShopping')}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-16 text-center">
      <Icon name="check" className="mx-auto text-6xl text-success" />
      <h1 className="mt-4 font-display text-headline-lg text-primary">
        {t('order.received', { number: order.orderNumber })}
      </h1>
      <p className="mx-auto mt-3 max-w-md text-body-md text-ink-muted">{t('order.willContact')}</p>

      <div className="mx-auto mt-8 max-w-md rounded-card border border-border p-4 text-left shadow-card">
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between py-2 text-body-sm text-ink">
              <span className="pr-2">
                {item.quantity}× {item.productName}
              </span>
              <span className="shrink-0 font-semibold">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-body-md font-bold text-ink">
          <span>{t('common.subtotal')}</span>
          <span>{formatPrice(order.subtotal)}</span>
        </div>
      </div>

      <a
        href={whatsappUrl(t('order.followUpMessage', { number: order.orderNumber }))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center gap-2 rounded bg-primary px-6 py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark"
      >
        <Icon name="whatsapp" />
        {t('order.sendWhatsapp')}
      </a>
      <div className="mt-4">
        <Link to="/shop" className="text-label-sm font-semibold text-primary hover:underline">
          {t('order.continueShopping')}
        </Link>
      </div>
    </Container>
  );
}
