import { useState } from 'react';
import type { AdminHomeTileDTO, HomeTileSlot } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Button, ConfirmDialog, Loader, Select } from '../../components/ui/index.js';
import { BilingualField, esOrNull } from '../../components/admin/BilingualField.js';
import { ImageUploadField } from '../../components/admin/ImageUploadField.js';

const input =
  'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';
const fieldLabel = 'mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted';

/**
 * Mirrors the `ICON_NAMES` union in apps/api/src/modules/admin/schema.ts, which
 * in turn mirrors `IconName` in ui/Icon.tsx. A Select of known icons, never
 * free text — the DB column is plain `text` and cannot enforce this.
 */
const ICON_OPTIONS = [
  'truck', 'shield', 'tag', 'headset', 'check', 'wrench', 'pin', 'phone',
  'whatsapp', 'cart', 'star', 'grid', 'user', 'search',
].map((v) => ({ value: v, label: v }));

const SLOTS: { slot: HomeTileSlot; title: string; blurb: string }[] = [
  {
    slot: 'promo',
    title: 'Promo cards',
    blurb: 'The two image cards beside the hero. Each has its own image and link.',
  },
  {
    slot: 'service',
    title: 'Trust row',
    blurb: 'The four icon tiles under the hero. Pick an icon; no image needed.',
  },
  {
    slot: 'ticker',
    title: 'Ticker',
    blurb: 'The scrolling strip at the very top of the page. Title only.',
  },
];

/** Admin chrome stays English by agreement; only the *content* is bilingual. */
export default function AdminHomePage() {
  const { data, loading, error, reload } = useAsync(() => api.adminHome(), []);

  return (
    <div>
      <h1 className="font-display text-headline-lg text-primary">Homepage</h1>
      <p className="mt-1 text-body-md text-ink-muted">
        Everything on the public homepage except the product rails. Leave a Spanish field blank
        to fall back to the English text.
      </p>

      {loading ? (
        <Loader />
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (
        <>
          <HeroForm hero={data?.hero ?? null} onSaved={reload} />
          {SLOTS.map((s) => (
            <TileSection
              key={s.slot}
              slot={s.slot}
              title={s.title}
              blurb={s.blurb}
              tiles={(data?.tiles ?? []).filter((t) => t.slot === s.slot)}
              onChanged={reload}
            />
          ))}
        </>
      )}
    </div>
  );
}

function HeroForm({
  hero,
  onSaved,
}: {
  hero: NonNullable<Awaited<ReturnType<typeof api.adminHome>>['hero']> | null;
  onSaved: () => void;
}) {
  const [eyebrow, setEyebrow] = useState(hero?.eyebrow ?? '');
  const [eyebrowEs, setEyebrowEs] = useState(hero?.eyebrowEs ?? '');
  const [headline, setHeadline] = useState(hero?.headline ?? '');
  const [headlineEs, setHeadlineEs] = useState(hero?.headlineEs ?? '');
  const [subcopy, setSubcopy] = useState(hero?.subcopy ?? '');
  const [subcopyEs, setSubcopyEs] = useState(hero?.subcopyEs ?? '');
  const [ctaLabel, setCtaLabel] = useState(hero?.ctaLabel ?? '');
  const [ctaLabelEs, setCtaLabelEs] = useState(hero?.ctaLabelEs ?? '');
  const [ctaHref, setCtaHref] = useState(hero?.ctaHref ?? '/shop');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.updateHero({
        eyebrow: eyebrow || null,
        eyebrowEs: esOrNull(eyebrowEs),
        headline,
        headlineEs: esOrNull(headlineEs),
        subcopy: subcopy || null,
        subcopyEs: esOrNull(subcopyEs),
        ctaLabel: ctaLabel || null,
        ctaLabelEs: esOrNull(ctaLabelEs),
        ctaHref,
      });
      setSaved(true);
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">Hero</h2>

      <div className="mb-5">
        <ImageUploadField
          label="Background image"
          url={hero?.imageUrl ?? null}
          hint="Wide landscape image; text is overlaid on the left."
          onUpload={async (file) => {
            const form = new FormData();
            form.append('file', file);
            const updated = await api.uploadHeroImage(form);
            onSaved();
            return updated?.imageUrl ?? null;
          }}
        />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <BilingualField label="Eyebrow" value={eyebrow} onChange={setEyebrow} valueEs={eyebrowEs} onChangeEs={setEyebrowEs} />
        <BilingualField label="Headline" required value={headline} onChange={setHeadline} valueEs={headlineEs} onChangeEs={setHeadlineEs} />
        <BilingualField label="Subcopy" textarea value={subcopy} onChange={setSubcopy} valueEs={subcopyEs} onChangeEs={setSubcopyEs} />
        <BilingualField label="Button label" value={ctaLabel} onChange={setCtaLabel} valueEs={ctaLabelEs} onChangeEs={setCtaLabelEs} />
        <label className="block sm:max-w-sm">
          <span className={fieldLabel}>Button link</span>
          <input className={input} value={ctaHref} onChange={(e) => setCtaHref(e.target.value)} />
        </label>

        {err && <p className="text-body-md text-error">{err}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="accent" disabled={busy}>
            {busy ? 'Saving…' : 'Save hero'}
          </Button>
          {saved && <span className="text-label-sm text-success">Saved.</span>}
        </div>
      </form>
    </section>
  );
}

function TileSection({
  slot,
  title,
  blurb,
  tiles,
  onChanged,
}: {
  slot: HomeTileSlot;
  title: string;
  blurb: string;
  tiles: AdminHomeTileDTO[];
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<'new' | AdminHomeTileDTO | null>(null);
  const [toDelete, setToDelete] = useState<AdminHomeTileDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteTile(toDelete.id);
      setToDelete(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 rounded-card border border-border bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-headline-md text-primary">{title}</h2>
          <p className="mt-1 text-body-md text-ink-muted">{blurb}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
          + Add
        </Button>
      </div>

      {editing !== null && (
        <TileForm
          key={editing === 'new' ? 'new' : editing.id}
          slot={slot}
          tile={editing === 'new' ? null : editing}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <ul className="mt-4 divide-y divide-border rounded border border-border">
        {tiles.map((tile) => (
          <li key={tile.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-md font-medium text-ink">{tile.title}</p>
              <p className="truncate text-label-sm text-ink-muted">
                {tile.titleEs ? `ES: ${tile.titleEs}` : 'No ES translation'}
                {tile.icon ? ` · ${tile.icon}` : ''}
                {tile.isPublished ? '' : ' · hidden'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(tile)}>Edit</Button>
            <Button variant="ghost" size="sm" onClick={() => setToDelete(tile)}>Delete</Button>
          </li>
        ))}
        {tiles.length === 0 && (
          <li className="p-6 text-center text-ink-muted">Nothing here yet.</li>
        )}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete this tile?"
        message={`"${toDelete?.title}" will be removed from the homepage. This can't be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </section>
  );
}

function TileForm({
  slot,
  tile,
  onDone,
  onCancel,
}: {
  slot: HomeTileSlot;
  tile: AdminHomeTileDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(tile?.title ?? '');
  const [titleEs, setTitleEs] = useState(tile?.titleEs ?? '');
  const [body, setBody] = useState(tile?.body ?? '');
  const [bodyEs, setBodyEs] = useState(tile?.bodyEs ?? '');
  const [icon, setIcon] = useState(tile?.icon ?? '');
  const [href, setHref] = useState(tile?.href ?? '');
  const [sortOrder, setSortOrder] = useState(String(tile?.sortOrder ?? 0));
  const [isPublished, setIsPublished] = useState(tile?.isPublished ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const body_ = {
      slot,
      title,
      titleEs: esOrNull(titleEs),
      body: body || null,
      bodyEs: esOrNull(bodyEs),
      icon: icon || null,
      href: href || null,
      sortOrder: Number(sortOrder),
      isPublished,
    };
    try {
      if (tile) await api.updateTile(tile.id, body_);
      else await api.createTile(body_);
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 rounded border border-border bg-surface-muted p-4">
      <div className="space-y-4">
        <BilingualField label="Title" required value={title} onChange={setTitle} valueEs={titleEs} onChangeEs={setTitleEs} />

        {slot !== 'ticker' && (
          <BilingualField label="Body" textarea rows={2} value={body} onChange={setBody} valueEs={bodyEs} onChangeEs={setBodyEs} />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {slot === 'service' && (
            <div>
              <span className={fieldLabel}>Icon</span>
              <Select
                value={icon}
                options={ICON_OPTIONS}
                placeholder="Choose an icon"
                onChange={setIcon}
                ariaLabel="Tile icon"
              />
            </div>
          )}
          {slot === 'promo' && (
            <label className="block">
              <span className={fieldLabel}>Link</span>
              <input className={input} value={href} placeholder="/shop?sort=featured" onChange={(e) => setHref(e.target.value)} />
            </label>
          )}
          <label className="block">
            <span className={fieldLabel}>Sort order</span>
            <input className={input} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
        </div>

        {slot === 'promo' && tile && (
          <ImageUploadField
            label="Card image"
            url={tile.imageUrl}
            onUpload={async (file) => {
              const form = new FormData();
              form.append('file', file);
              const updated = await api.uploadTileImage(tile.id, form);
              return updated.imageUrl;
            }}
          />
        )}
        {slot === 'promo' && !tile && (
          <p className="text-label-sm text-ink-muted">Save the card first, then upload its image.</p>
        )}

        <label className="flex items-center gap-2 text-body-md text-ink">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[color:var(--color-primary)]"
          />
          Visible on the homepage
        </label>
      </div>

      {err && <p className="mt-3 text-body-md text-error">{err}</p>}
      <div className="mt-4 flex gap-3">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
