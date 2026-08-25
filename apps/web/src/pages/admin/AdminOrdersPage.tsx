import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { OrderStatus } from '@tools-jamaica/shared';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Badge, Loader, Pagination, Select } from '../../components/ui/index.js';
import { formatPrice } from '../../lib/format.js';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
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

export default function AdminOrdersPage() {
  const [sp, setSp] = useSearchParams();
  const status = (sp.get('status') as OrderStatus) || '';
  const q = sp.get('q') ?? '';
  const page = Math.max(1, Number(sp.get('page') || '1'));

  const { data, loading, error } = useAsync(
    () => api.adminOrders({ status: status || undefined, q: q || undefined, page, pageSize: PAGE_SIZE }),
    [status, q, page],
  );

  const update = (mutate: (next: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(sp);
    if (resetPage) next.delete('page');
    mutate(next);
    setSp(next, { replace: true });
  };

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]);
  useEffect(() => {
    if (searchInput === q) return;
    const handle = setTimeout(() => {
      update((next) => (searchInput ? next.set('q', searchInput) : next.delete('q')));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <h1 className="font-display text-headline-lg text-primary">Orders</h1>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={searchInput}
          placeholder="Search order #, name, phone…"
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-body-md"
        />
        <div className="w-full max-w-[200px]">
          <Select
            ariaLabel="Filter by status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={(v) => update((next) => (v ? next.set('status', v) : next.delete('status')))}
          />
        </div>
      </div>

      {loading ? (
        <Loader />
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[720px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Items</th>
                <th className="px-4 py-3 font-semibold">Subtotal</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((o, i) => (
                <tr key={o.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3">
                    <Link to={`/admin/orders/${o.id}`} className="font-semibold text-primary hover:underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{o.customerName}</div>
                    <div className="text-label-sm text-ink-muted">{o.customerPhone}</div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{o.itemCount}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatPrice(o.subtotal)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                  </td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={page} pageCount={totalPages} onChange={(p) => update((next) => next.set('page', String(p)), false)} />
        </div>
      )}
    </div>
  );
}
