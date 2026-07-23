import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminProductListItem } from '@tools-jamaica/shared';
import { api } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Badge, Button, ConfirmDialog, ImageWithFallback, Loader } from '../../components/ui/index.js';
import { formatPrice } from '../../lib/format.js';

export default function AdminProductsPage() {
  const [q, setQ] = useState('');
  const { data, loading, error, reload } = useAsync(
    () => api.adminProducts({ q: q || undefined, pageSize: 100 }),
    [q],
  );
  const [toDelete, setToDelete] = useState<AdminProductListItem | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteProduct(toDelete.id);
      setToDelete(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">Products</h1>
        <Link to="/admin/products/new">
          <Button variant="accent">+ New product</Button>
        </Link>
      </div>

      <input
        type="search"
        value={q}
        placeholder="Search products…"
        onChange={(e) => setQ(e.target.value)}
        className="mt-6 w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-body-md"
      />

      {loading ? (
        <Loader />
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[640px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Category</th>
                <th className="px-4 py-3 font-semibold">Price</th>
                <th className="px-4 py-3 font-semibold">Stock</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((p, i) => (
                <tr key={p.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ImageWithFallback src={p.primaryImage?.url} alt={p.name} className="h-10 w-10 shrink-0 rounded" />
                      <span className="font-medium text-ink">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{p.category?.label ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatPrice(p.price)}</td>
                  <td className="px-4 py-3 text-ink-muted">{p.stock}</td>
                  <td className="px-4 py-3">
                    {p.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Draft</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Link to={`/admin/products/${p.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => setToDelete(p)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">No products found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete product?"
        message={`"${toDelete?.name}" and its images will be permanently removed.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
