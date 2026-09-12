import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AdminUserListItem, Role } from '@tools-jamaica/shared';
import { api, ApiError } from '../../lib/api.js';
import { useAsync } from '../../lib/useAsync.js';
import { useAuth } from '../../context/AuthContext.js';
import { Badge, Button, ConfirmDialog, Loader, Pagination, Select } from '../../components/ui/index.js';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'customer', label: 'Customers' },
  { value: 'admin', label: 'Admins' },
];

const ROLE_OPTIONS = [
  { value: 'customer', label: 'Customer' },
  { value: 'admin', label: 'Admin' },
];

const input =
  'w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary';

/**
 * Admin Users. English-hardcoded like every other back-office page.
 *
 * Create, list and activate/deactivate only — no role change, no password
 * reset, no hard delete. Confirmation state isn't shown: the list reads
 * `profiles`, and `email_confirmed_at` lives on auth.users (see the API's
 * listAdminUsers).
 */
export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [sp, setSp] = useSearchParams();
  const role = (sp.get('role') as Role | null) ?? '';
  const q = sp.get('q') ?? '';
  const page = Math.max(1, Number(sp.get('page') || '1'));

  const { data, loading, error, reload } = useAsync(
    () => api.adminUsers({ q: q || undefined, role: role || undefined, page, pageSize: PAGE_SIZE }),
    [q, role, page],
  );

  const [creating, setCreating] = useState(false);
  const [toToggle, setToToggle] = useState<AdminUserListItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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

  const confirmToggle = async () => {
    if (!toToggle) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.setUserActive(toToggle.id, !toToggle.isActive);
      setToToggle(null);
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Update failed');
      setToToggle(null);
    } finally {
      setBusy(false);
    }
  };

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-headline-lg text-primary">Users</h1>
        <Button variant="accent" onClick={() => setCreating(true)}>+ New user</Button>
      </div>

      {creating && (
        <UserForm
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={searchInput}
          placeholder="Search email or name…"
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full max-w-sm rounded border border-border bg-surface px-3 py-2 text-body-md"
        />
        <div className="w-full max-w-[200px]">
          <Select
            ariaLabel="Filter by role"
            value={role}
            options={ROLE_FILTER_OPTIONS}
            onChange={(v) => update((next) => (v ? next.set('role', v) : next.delete('role')))}
          />
        </div>
      </div>

      {actionError && <p className="mt-4 text-body-md text-error">{actionError}</p>}

      {loading ? (
        <Loader />
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[640px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Joined</th>
                <th className="px-4 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((u, i) => (
                <tr key={u.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-medium text-ink">{u.email}</td>
                  <td className="px-4 py-3 text-ink-muted">{u.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Badge tone={u.role === 'admin' ? 'navy' : 'neutral'}>{u.role}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={u.isActive ? 'success' : 'neutral'}>
                      {u.isActive ? 'Active' : 'Disabled'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      {/* The API rejects self-deactivation with a 409; hiding the
                          button keeps the admin from meeting that error at all. */}
                      {u.id !== me?.id && (
                        <Button variant="outline" size="sm" onClick={() => setToToggle(u)}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(data?.items ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            pageCount={totalPages}
            onChange={(p) => update((next) => next.set('page', String(p)), false)}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!toToggle}
        danger={toToggle?.isActive === true}
        busy={busy}
        title={toToggle?.isActive ? 'Deactivate account?' : 'Activate account?'}
        message={
          toToggle?.isActive
            ? `"${toToggle?.email}" will be signed out on their next request and cannot sign in again until reactivated.`
            : `"${toToggle?.email}" will be able to sign in again.`
        }
        confirmLabel={toToggle?.isActive ? 'Deactivate' : 'Activate'}
        onConfirm={confirmToggle}
        onCancel={() => setToToggle(null)}
      />
    </div>
  );
}

/**
 * Admin-created accounts are pre-confirmed and no email is sent — the admin
 * types the password here and hands it over out of band.
 */
function UserForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('customer');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setBusy(true);
    try {
      await api.createUser({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
        role,
      });
      onDone();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-6 rounded-card border border-border bg-surface p-6">
      <h2 className="mb-4 font-display text-headline-md text-primary">New user</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Email *</span>
          <input className={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Full name</span>
          <input className={input} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Password *</span>
          <input
            className={input}
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <div className="block">
          <span className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Role</span>
          <Select ariaLabel="Role" value={role} options={ROLE_OPTIONS} onChange={(v) => setRole(v as Role)} />
        </div>
      </div>

      <p className="mt-3 text-body-sm text-ink-muted">
        No email is sent. The account is confirmed immediately — give the person their password directly.
      </p>

      {err && <p className="mt-3 text-body-md text-error">{err}</p>}
      <div className="mt-5 flex gap-3">
        <Button type="submit" variant="accent" disabled={busy}>{busy ? 'Saving…' : 'Create user'}</Button>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
