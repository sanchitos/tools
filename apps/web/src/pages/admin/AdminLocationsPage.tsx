import { useState } from 'react';
import type { AdminStoreLocationDTO } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { Button, ConfirmDialog, Loader } from '../../components/ui/index.js';
import { BilingualField, esOrNull } from '../../components/admin/BilingualField.js';
import { ImageUploadField } from '../../components/admin/ImageUploadField.js';

const input =
  'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';
const fieldLabel = 'mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted';

type Editing = 'new' | AdminStoreLocationDTO | null;

/**
 * Branches get their own page, not a section under "Homepage": they are
 * business data rendered by the Footer on EVERY page, and an admin looking for
 * "our addresses" would never think to open the homepage editor.
 */
export default function AdminLocationsPage() {
  const { data, loading, error, reload } = useAsync(() => api.adminLocations(), []);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<AdminStoreLocationDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api.deleteLocation(toDelete.id);
      setToDelete(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">Locations</h1>
        <Button variant="accent" onClick={() => setEditing('new')}>+ New location</Button>
      </div>
      <p className="mt-1 text-body-md text-ink-muted">
        Shown in the site footer on every page and in the “Visit us” block on the homepage.
      </p>

      {editing !== null && (
        <LocationForm
          key={editing === 'new' ? 'new' : editing.id}
          location={editing === 'new' ? null : editing}
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
          <table className="w-full min-w-[640px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Address</th>
                <th className="px-4 py-3 font-semibold">Phone</th>
                <th className="px-4 py-3 font-semibold">Order</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((loc, i) => (
                <tr key={loc.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-medium text-ink">
                    {loc.name}
                    {!loc.nameEs && (
                      <span className="ml-2 rounded bg-warning px-1.5 py-0.5 text-label-xs font-semibold text-warning-fg">
                        No ES
                      </span>
                    )}
                    {!loc.isPublished && <span className="ml-2 text-label-sm text-ink-muted">hidden</span>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{loc.address}</td>
                  <td className="px-4 py-3 text-ink-muted">{loc.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{loc.sortOrder}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEditing(loc)}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => setToDelete(loc)}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-ink-muted">No locations yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        danger
        busy={busy}
        title="Delete location?"
        message={`"${toDelete?.name}" will be removed from the footer and the homepage.`}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function LocationForm({
  location,
  onDone,
  onCancel,
}: {
  location: AdminStoreLocationDTO | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(location?.name ?? '');
  const [nameEs, setNameEs] = useState(location?.nameEs ?? '');
  const [address, setAddress] = useState(location?.address ?? '');
  const [phone, setPhone] = useState(location?.phone ?? '');
  const [hours, setHours] = useState(location?.hours ?? '');
  const [hoursEs, setHoursEs] = useState(location?.hoursEs ?? '');
  const [mapUrl, setMapUrl] = useState(location?.mapUrl ?? '');
  const [sortOrder, setSortOrder] = useState(String(location?.sortOrder ?? 0));
  const [isPublished, setIsPublished] = useState(location?.isPublished ?? true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const body = {
      name,
      nameEs: esOrNull(nameEs),
      address,
      phone: phone || null,
      hours: hours || null,
      hoursEs: esOrNull(hoursEs),
      mapUrl: mapUrl || null,
      sortOrder: Number(sortOrder),
      isPublished,
    };
    try {
      if (location) await api.updateLocation(location.id, body);
      else await api.createLocation(body);
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">
        {location ? 'Edit location' : 'New location'}
      </h2>

      <div className="space-y-4">
        <BilingualField label="Branch name" required value={name} onChange={setName} valueEs={nameEs} onChangeEs={setNameEs} />

        <label className="block">
          {/* Not bilingual: an address is an address. */}
          <span className={fieldLabel}>Address *</span>
          <input className={input} required value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>

        <BilingualField label="Opening hours" value={hours} onChange={setHours} valueEs={hoursEs} onChangeEs={setHoursEs} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={fieldLabel}>Phone</span>
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Map link</span>
            <input className={input} value={mapUrl} placeholder="https://maps.google.com/…" onChange={(e) => setMapUrl(e.target.value)} />
          </label>
          <label className="block">
            <span className={fieldLabel}>Sort order</span>
            <input className={input} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </label>
        </div>

        {location ? (
          <ImageUploadField
            label="Photo"
            url={location.imageUrl}
            hint="Optional; shown on the homepage “Visit us” card."
            onUpload={async (file) => {
              const form = new FormData();
              form.append('file', file);
              const updated = await api.uploadLocationImage(location.id, form);
              return updated.imageUrl;
            }}
          />
        ) : (
          <p className="text-label-sm text-ink-muted">Save the location first, then add a photo.</p>
        )}

        <label className="flex items-center gap-2 text-body-md text-ink">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
            className="h-4 w-4 rounded border-border accent-[color:var(--color-primary)]"
          />
          Visible on the site
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
