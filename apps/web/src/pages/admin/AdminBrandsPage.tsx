import { useState } from 'react';
import type { AdminBrandDTO } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Button, ConfirmDialog, Loader } from '../../components/ui/index.js';

type Editing = 'new' | AdminBrandDTO | null;
const input = 'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';

export default function AdminBrandsPage() {
  const { data, loading, error, reload } = useAsync(() => api.adminBrands(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<AdminBrandDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteBrand(toDelete.id);
      setToDelete(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">Brands</h1>
        <Button variant="accent" onClick={() => setEditing('new')}>+ New brand</Button>
      </div>

      {editing !== null && (
        <BrandForm
          key={editing === 'new' ? 'new' : editing.id}
          brand={editing === 'new' ? null : editing}
          onDone={() => { setEditing(null); reload(); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {loading ? (
        <Loader />
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[480px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((b, i) => (
                <tr key={b.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-medium text-ink">{b.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{b.slug}</td>
                  <td className="px-4 py-3 text-ink-muted">{b.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(b)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setToDelete(b)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={4} className="px-4 py-10 text-center text-ink-muted">No brands yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete brand?"
        message={`"${toDelete?.name}" will be removed. Products keep their other details but lose this brand.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function BrandForm({
  brand,
  onDone,
  onCancel,
}: {
  brand: AdminBrandDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(brand?.name ?? '');
  const [slug, setSlug] = useState(brand?.slug ?? '');
  const [logoUrl, setLogoUrl] = useState(brand?.logoUrl ?? '');
  const [sortOrder, setSortOrder] = useState(String(brand?.sortOrder ?? 0));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const body = { name, slug: slug || undefined, logoUrl: logoUrl || null, sortOrder: Number(sortOrder) };
    try {
      if (brand) await api.updateBrand(brand.id, body);
      else await api.createBrand(body);
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">{brand ? 'Edit brand' : 'New brand'}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Name *</span>
          <input className={input} required value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Slug</span>
          <input className={input} value={slug} placeholder="auto from name" onChange={(e) => setSlug(e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Logo URL</span>
          <input className={input} value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Sort order</span>
          <input className={input} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></label>
      </div>
      {err && <p className="mt-3 text-body-md text-error">{err}</p>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
