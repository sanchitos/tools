import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { ProductImageDTO } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import {
  Badge,
  Button,
  ConfirmDialog,
  ImageWithFallback,
  Loader,
  Select,
} from '../../components/ui/index.js';

interface SpecRow { label: string; value: string }
interface HighlightRow { text: string }

interface FormState {
  name: string;
  slug: string;
  categoryId: string;
  brandId: string;
  shortDescription: string;
  description: string;
  price: string;
  stock: string;
  sku: string;
  featured: boolean;
  isPublished: boolean;
  specs: SpecRow[];
  highlights: HighlightRow[];
}

const EMPTY: FormState = {
  name: '', slug: '', categoryId: '', brandId: '', shortDescription: '', description: '',
  price: '', stock: '0', sku: '', featured: false, isPublished: true, specs: [], highlights: [],
};

export default function ProductEditorPage() {
  const { id = 'new' } = useParams();
  const isNew = id === 'new';
  const navigate = useNavigate();

  const cats = useAsync(() => api.adminCategories(), []);
  const brands = useAsync(() => api.adminBrands(), []);
  const product = useAsync(() => (isNew ? Promise.resolve(null) : api.adminProduct(id)), [id]);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const p = product.data;
    if (!p) return;
    setForm({
      name: p.name, slug: p.slug, categoryId: p.categoryId ?? '', brandId: p.brandId ?? '',
      shortDescription: p.shortDescription ?? '', description: p.description ?? '',
      price: String(p.price), stock: String(p.stock), sku: p.sku ?? '',
      featured: p.featured, isPublished: p.isPublished,
      specs: p.specs.map((s) => ({ label: s.label, value: s.value })),
      highlights: p.highlights.map((h) => ({ text: h.text })),
    });
  }, [product.data]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!form.categoryId) { setError('Please choose a category'); return; }
    setSaving(true);
    const payload = {
      name: form.name,
      slug: form.slug || undefined,
      categoryId: form.categoryId,
      brandId: form.brandId || null,
      shortDescription: form.shortDescription || null,
      description: form.description || null,
      price: Number(form.price),
      stock: Number(form.stock),
      sku: form.sku || null,
      featured: form.featured,
      isPublished: form.isPublished,
      specs: form.specs.filter((s) => s.label && s.value).map((s, i) => ({ ...s, sortOrder: i })),
      highlights: form.highlights.filter((h) => h.text).map((h, i) => ({ ...h, sortOrder: i })),
    };
    try {
      if (isNew) {
        const created = await api.createProduct(payload);
        navigate(`/admin/products/${created.id}`, { replace: true });
      } else {
        await api.updateProduct(id, payload);
        product.reload();
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isNew && product.loading) return <Loader />;

  const categoryOptions = (cats.data ?? []).map((c) => ({ value: c.id, label: c.label }));
  const brandOptions = [{ value: '', label: '— No brand —' }, ...(brands.data ?? []).map((b) => ({ value: b.id, label: b.name }))];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link to="/admin" className="text-label-sm text-ink-muted hover:text-primary">← Products</Link>
          <h1 className="mt-1 font-display text-headline-lg text-primary">
            {isNew ? 'New product' : form.name || 'Edit product'}
          </h1>
        </div>
        {saved && <Badge tone="success">Saved</Badge>}
      </div>

      <form onSubmit={save} className="space-y-6">
        <Card title="Details">
          <Field label="Name" required>
            <input className={input} required value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Slug (optional)">
              <input className={input} value={form.slug} placeholder="auto from name" onChange={(e) => set('slug', e.target.value)} />
            </Field>
            <Field label="SKU">
              <input className={input} value={form.sku} onChange={(e) => set('sku', e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Category" required>
              <Select value={form.categoryId} options={categoryOptions} placeholder="Choose a category" onChange={(v) => set('categoryId', v)} />
            </Field>
            <Field label="Brand">
              <Select value={form.brandId} options={brandOptions} onChange={(v) => set('brandId', v)} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Price (J$)" required>
              <input className={input} type="number" min="0" step="0.01" required value={form.price} onChange={(e) => set('price', e.target.value)} />
            </Field>
            <Field label="Stock">
              <input className={input} type="number" min="0" value={form.stock} onChange={(e) => set('stock', e.target.value)} />
            </Field>
          </div>
          <Field label="Short description">
            <input className={input} value={form.shortDescription} onChange={(e) => set('shortDescription', e.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className={`${input} min-h-28`} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-6">
            <Toggle label="Featured" checked={form.featured} onChange={(v) => set('featured', v)} />
            <Toggle label="Published" checked={form.isPublished} onChange={(v) => set('isPublished', v)} />
          </div>
        </Card>

        <Card title="Highlights">
          <RowEditor
            rows={form.highlights}
            onAdd={() => set('highlights', [...form.highlights, { text: '' }])}
            onRemove={(i) => set('highlights', form.highlights.filter((_, x) => x !== i))}
            render={(row, i) => (
              <input
                className={input}
                placeholder="Highlight"
                value={row.text}
                onChange={(e) => set('highlights', form.highlights.map((r, x) => (x === i ? { text: e.target.value } : r)))}
              />
            )}
            addLabel="+ Add highlight"
          />
        </Card>

        <Card title="Specifications">
          <RowEditor
            rows={form.specs}
            onAdd={() => set('specs', [...form.specs, { label: '', value: '' }])}
            onRemove={(i) => set('specs', form.specs.filter((_, x) => x !== i))}
            render={(row, i) => (
              <div className="flex flex-1 gap-2">
                <input
                  className={input}
                  placeholder="Label"
                  value={row.label}
                  onChange={(e) => set('specs', form.specs.map((r, x) => (x === i ? { ...r, label: e.target.value } : r)))}
                />
                <input
                  className={input}
                  placeholder="Value"
                  value={row.value}
                  onChange={(e) => set('specs', form.specs.map((r, x) => (x === i ? { ...r, value: e.target.value } : r)))}
                />
              </div>
            )}
            addLabel="+ Add spec"
          />
        </Card>

        {error && <p className="rounded border border-error/30 bg-error-container px-3 py-2 text-body-md text-error-onContainer">{error}</p>}

        <div className="flex gap-3">
          <Button type="submit" variant="accent" disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Create product' : 'Save changes'}
          </Button>
          <Link to="/admin"><Button type="button" variant="ghost">Cancel</Button></Link>
        </div>
      </form>

      {/* Images (only for existing products) */}
      {!isNew && product.data && (
        <ImageManager productId={id} images={product.data.images} onChange={() => product.reload()} />
      )}
      {isNew && (
        <p className="mt-8 rounded-card border border-dashed border-border p-4 text-body-md text-ink-muted">
          Save the product first to add images.
        </p>
      )}
    </div>
  );
}

// --- Image manager ---------------------------------------------------------

function ImageManager({
  productId,
  images,
  onChange,
}: {
  productId: string;
  images: ProductImageDTO[];
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [toDelete, setToDelete] = useState<ProductImageDTO | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (file: File) => {
    setErr(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      if (images.length === 0) form.append('isPrimary', 'true');
      await api.uploadImage(productId, form);
      onChange();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= images.length) return;
    const reordered = [...images];
    const [m] = reordered.splice(idx, 1);
    reordered.splice(target, 0, m!);
    setBusy(true);
    try {
      await api.reorderImages(productId, reordered.map((img, i) => ({ id: img.id, sortOrder: i })));
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (imageId: string) => {
    setBusy(true);
    try {
      await api.setPrimaryImage(productId, imageId);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteImage(productId, toDelete.id);
      setToDelete(null);
      onChange();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-headline-md text-primary">Images</h2>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? 'Working…' : 'Upload image'}
          </Button>
        </div>
      </div>
      {err && <p className="mb-3 text-body-md text-error">{err}</p>}

      {images.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-body-md text-ink-muted">
          No images yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.id} className="rounded-card border border-border bg-surface p-2">
              <div className="relative">
                <ImageWithFallback src={img.url} alt={img.altText ?? ''} className="aspect-square rounded" />
                {img.isPrimary && <Badge tone="accent" className="absolute left-2 top-2">Primary</Badge>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-1">
                <div className="flex gap-1">
                  <IconBtn label="Move left" disabled={busy || i === 0} onClick={() => move(i, -1)}>←</IconBtn>
                  <IconBtn label="Move right" disabled={busy || i === images.length - 1} onClick={() => move(i, 1)}>→</IconBtn>
                </div>
                <div className="flex gap-1">
                  {!img.isPrimary && (
                    <button className="text-label-sm text-primary hover:underline" disabled={busy} onClick={() => makePrimary(img.id)}>
                      Primary
                    </button>
                  )}
                  <button className="text-label-sm text-error hover:underline" disabled={busy} onClick={() => setToDelete(img)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete image?"
        message="This removes the image and its stored file."
        confirmLabel="Delete"
        onConfirm={remove}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

// --- Small building blocks -------------------------------------------------

const input =
  'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
        {label}{required && <span className="text-accent"> *</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body-md text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

function IconBtn({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded border border-border text-ink-muted hover:border-primary hover:text-primary disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function RowEditor<T>({
  rows,
  onAdd,
  onRemove,
  render,
  addLabel,
}: {
  rows: T[];
  onAdd: () => void;
  onRemove: (i: number) => void;
  render: (row: T, i: number) => React.ReactNode;
  addLabel: string;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          {render(row, i)}
          <button type="button" aria-label="Remove" onClick={() => onRemove(i)} className="text-error hover:underline">
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd} className="text-label-lg font-semibold text-primary hover:text-accent">
        {addLabel}
      </button>
    </div>
  );
}
