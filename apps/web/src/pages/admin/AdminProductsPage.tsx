import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminProductListItem } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
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

  // --- Unused-image sweep --------------------------------------------------
  // ALWAYS scans first (dryRun). The delete is irreversible and the admin has
  // never seen these files, so the confirmation names the actual paths rather
  // than asking them to authorise a number.
  const [scanning, setScanning] = useState(false);
  const [orphans, setOrphans] = useState<string[] | null>(null);
  const [sweepNote, setSweepNote] = useState<string | null>(null);
  const [sweepError, setSweepError] = useState<string | null>(null);

  const scanOrphans = async () => {
    setScanning(true);
    setSweepNote(null);
    setSweepError(null);
    try {
      const result = await api.cleanupOrphans(true);
      // Nothing to confirm: say so inline rather than opening an empty dialog.
      if (result.paths.length === 0) setSweepNote('No unused images found.');
      else setOrphans(result.paths);
    } catch (e) {
      setSweepError(e instanceof ApiError ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const confirmSweep = async () => {
    setBusy(true);
    setSweepError(null);
    try {
      const result = await api.cleanupOrphans();
      setOrphans(null);
      setSweepNote(`Deleted ${result.deleted} unused image${result.deleted === 1 ? '' : 's'}.`);
      reload(); // thumbnails may now be missing
    } catch (e) {
      setSweepError(e instanceof ApiError ? e.message : 'Cleanup failed');
    } finally {
      setBusy(false);
    }
  };

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
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={scanning} onClick={scanOrphans}>
            {scanning ? 'Scanning…' : 'Clean up unused images'}
          </Button>
          <Link to="/admin/products/new">
            <Button variant="accent">+ New product</Button>
          </Link>
        </div>
      </div>

      {scanning && <Loader className="mt-3" />}
      {sweepNote && <p className="mt-3 text-body-md text-success">{sweepNote}</p>}
      {sweepError && <p className="mt-3 text-body-md text-error">{sweepError}</p>}

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
                      {!p.nameEs && (
                        <Badge tone="warning" className="shrink-0 text-label-xs">No ES</Badge>
                      )}
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
        open={orphans !== null}
        danger
        busy={busy}
        title={`Delete ${orphans?.length ?? 0} unused image${orphans?.length === 1 ? '' : 's'}?`}
        message={
          <div>
            <p>
              These files are in the product-image and brand-logo storage and are no longer
              referenced by any product or brand. Deleting them can&apos;t be undone.
            </p>
            <ul className="mt-3 max-h-48 overflow-auto rounded border border-border bg-surface-muted p-2 text-label-sm">
              {(orphans ?? []).slice(0, 20).map((path) => (
                <li key={path} className="truncate font-mono">{path}</li>
              ))}
              {(orphans?.length ?? 0) > 20 && (
                <li className="pt-1 text-ink-muted">…and {(orphans?.length ?? 0) - 20} more</li>
              )}
            </ul>
          </div>
        }
        confirmLabel="Delete files"
        onConfirm={confirmSweep}
        onCancel={() => setOrphans(null)}
      />

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
