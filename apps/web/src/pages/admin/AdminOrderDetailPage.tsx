import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { OrderStatus } from '@tools-jamaica/shared';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Badge, ConfirmDialog, Loader, Select } from '../../components/ui/index.js';
import { formatPrice } from '../../lib/format.js';

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_TONE = {
  new: 'accent',
  confirmed: 'navy',
  fulfilled: 'success',
  cancelled: 'neutral',
} as const;

export default function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const { data: order, loading, error, reload } = useAsync(() => api.adminOrder(id), [id]);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const setStatus = async (status: OrderStatus) => {
    setBusy(true);
    try {
      await api.updateOrderStatus(id, status);
      reload();
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loader />;
  if (error || !order) {
    return (
      <div>
        <p className="text-error">{error ?? 'Order not found.'}</p>
        <Link to="/admin/orders" className="mt-4 inline-block text-primary hover:underline">
          ← Back to orders
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link to="/admin/orders" className="text-label-sm font-semibold text-primary hover:underline">
        ← Back to orders
      </Link>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-headline-lg text-primary">{order.orderNumber}</h1>
        <div className="flex items-center gap-3">
          <Badge tone={STATUS_TONE[order.status]}>{order.status}</Badge>
          <div className="w-44">
            <Select
              ariaLabel="Order status"
              value={order.status}
              options={STATUS_OPTIONS}
              disabled={busy}
              onChange={(v) => setStatus(v as OrderStatus)}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-card border border-border">
          <table className="w-full border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">SKU</th>
                <th className="px-4 py-3 font-semibold">Unit price</th>
                <th className="px-4 py-3 font-semibold">Qty</th>
                <th className="px-4 py-3 text-right font-semibold">Line total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => (
                <tr key={item.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-medium text-ink">{item.productName}</td>
                  <td className="px-4 py-3 text-ink-muted">{item.productSku ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatPrice(item.unitPrice)}</td>
                  <td className="px-4 py-3 text-ink-muted">{item.quantity}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">
                    {formatPrice(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-semibold text-ink">
                  Subtotal
                </td>
                <td className="px-4 py-3 text-right font-bold text-accent">
                  {formatPrice(order.subtotal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="space-y-4">
          <div className="rounded-card border border-border p-4">
            <h2 className="text-label-lg font-semibold uppercase tracking-wide text-ink-muted">Customer</h2>
            <p className="mt-2 font-medium text-ink">{order.customerName}</p>
            <a href={`tel:${order.customerPhone}`} className="mt-1 block text-body-sm text-primary hover:underline">
              {order.customerPhone}
            </a>
            {order.customerEmail && <p className="text-body-sm text-ink-muted">{order.customerEmail}</p>}
            <p className="mt-3 text-body-sm text-ink">
              {order.fulfillment === 'delivery' ? 'Delivery' : 'Pickup'}
            </p>
            {order.deliveryAddress && (
              <p className="text-body-sm text-ink-muted">{order.deliveryAddress}</p>
            )}
            {order.notes && (
              <p className="mt-3 border-t border-border pt-3 text-body-sm text-ink-muted">{order.notes}</p>
            )}
            {(() => {
              const digits = order.customerPhone.replace(/\D/g, '');
              if (!digits) return null;
              const message = `Hi ${order.customerName}, this is Tools Jamaica about order ${order.orderNumber}.`;
              return (
                <a
                  href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-primary py-2.5 text-label-sm font-semibold text-primary-fg hover:bg-primary-dark"
                >
                  WhatsApp customer
                </a>
              );
            })()}
          </div>

          {order.status !== 'cancelled' && (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded border-2 border-error py-2.5 text-label-sm font-semibold text-error hover:bg-error-container"
            >
              Cancel order
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        danger
        busy={busy}
        title="Cancel this order?"
        message={`Order ${order.orderNumber} will be marked cancelled.`}
        confirmLabel="Cancel order"
        onConfirm={async () => {
          await setStatus('cancelled');
          setConfirmCancel(false);
        }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
