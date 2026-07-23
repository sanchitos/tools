import { useState } from 'react';
import type { AdminCategoryDTO } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Badge, Button, ConfirmDialog, Loader } from '../../components/ui/index.js';

type Editing = 'new' | AdminCategoryDTO | null;
const input = 'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';

export default function AdminCategoriesPage() {
  const { data, loading, error, reload } = useAsync(() => api.adminCategories(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<AdminCategoryDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    setDelErr(null);
    try {
      await api.deleteCategory(toDelete.id);
      setToDelete(null);
      reload();
    } catch (e) {
      setDelErr(e instanceof ApiError ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">Categories</h1>
        <Button variant="accent" onClick={() => setEditing('new')}>+ New category</Button>
      </div>

      {editing !== null && (
        <CategoryForm
          key={editing === 'new' ? 'new' : editing.id}
          category={editing === 'new' ? null : editing}
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
          <table className="w-full min-w-[560px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Label</th>
                <th className="px-4 py-3 font-semibold">Slug</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((c, i) => (
                <tr key={c.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-medium text-ink">{c.label}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.slug}</td>
                  <td className="px-4 py-3 text-ink-muted">{c.sortOrder}</td>
                  <td className="px-4 py-3">{c.isPublished ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Hidden</Badge>}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(c)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => { setDelErr(null); setToDelete(c); }}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete category?"
        message={delErr ?? `Delete "${toDelete?.label}"? Categories with products can't be deleted.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function CategoryForm({
  category,
  onDone,
  onCancel,
}: {
  category: AdminCategoryDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(category?.label ?? '');
  const [slug, setSlug] = useState(category?.slug ?? '');
  const [imageUrl, setImageUrl] = useState(category?.imageUrl ?? '');
  const [sortOrder, setSortOrder] = useState(String(category?.sortOrder ?? 0));
  const [isPublished, setIsPublished] = useState(category?.isPublished ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const body = {
      label,
      slug: slug || undefined,
      imageUrl: imageUrl || null,
      sortOrder: Number(sortOrder),
      isPublished,
    };
    try {
      if (category) await api.updateCategory(category.id, body);
      else await api.createCategory(body);
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">{category ? 'Edit category' : 'New category'}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Label *</span>
          <input className={input} required value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Slug</span>
          <input className={input} value={slug} placeholder="auto from label" onChange={(e) => setSlug(e.target.value)} /></label>
        <label className="block sm:col-span-2"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Image URL</span>
          <input className={input} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Sort order</span>
          <input className={input} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></label>
        <label className="flex items-center gap-2 pt-6 text-body-md text-ink">
          <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} className="h-4 w-4" /> Published
        </label>
      </div>
      {err && <p className="mt-3 text-body-md text-error">{err}</p>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
