import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { OrderStatus } from '@tools-jamaica/shared';
import { useAuth } from '../context/AuthContext.js';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { Badge, Container, Loader } from '../components/ui/index.js';
import { formatPrice } from '../lib/format.js';
import { useT } from '../i18n/LocaleContext.js';
import type { TranslationKey } from '../i18n/index.js';

const STATUS_TONE = {
  new: 'accent',
  confirmed: 'navy',
  fulfilled: 'success',
  cancelled: 'neutral',
} as const;

const STATUS_KEY: Record<OrderStatus, TranslationKey> = {
  new: 'account.status.new',
  confirmed: 'account.status.confirmed',
  fulfilled: 'account.status.fulfilled',
  cancelled: 'account.status.cancelled',
};

/** The signed-in shopper's home: who they are, their orders, and a way out. */
export default function AccountPage() {
  const t = useT();
  const navigate = useNavigate();
  const { user, loading: authLoading, logout } = useAuth();
  // The hook must run unconditionally, so it is declared above the redirect
  // below; with no session the request 401s and the page never renders anyway.
  const { data, loading, error } = useAsync(() => api.myOrders(), []);

  if (authLoading) {
    return (
      <Container className="py-16">
        <Loader />
      </Container>
    );
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-headline-lg text-primary">{t('account.title')}</h1>
          <p className="mt-1 text-body-md text-ink-muted">
            {t('account.signedInAs')} <span className="font-semibold text-ink">{user.email}</span>
            {user.fullName && ` · ${user.fullName}`}
          </p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await logout();
            navigate('/');
          }}
          className="rounded border border-border px-4 py-2 text-label-sm font-semibold text-ink hover:bg-surface-muted"
        >
          {t('auth.signOut')}
        </button>
      </div>

      <h2 className="mt-10 font-display text-headline-md text-ink">{t('account.orderHistory')}</h2>

      {loading ? (
        <div className="mt-6">
          <Loader />
        </div>
      ) : error ? (
        <p className="mt-6 text-error">{error}</p>
      ) : (data ?? []).length === 0 ? (
        <div className="mt-6 rounded-card border border-border bg-surface p-8 text-center">
          <p className="text-body-md text-ink-muted">{t('account.noOrders')}</p>
          <Link
            to="/shop"
            className="mt-4 inline-block rounded bg-primary px-5 py-2.5 text-label-md font-semibold text-primary-fg hover:bg-primary-dark"
          >
            {t('account.startShopping')}
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[560px] border-collapse text-body-md">
            <thead>
              <tr className="bg-neutralStrong text-left text-label-sm uppercase tracking-wide text-neutralStrong-fg">
                <th className="px-4 py-3 font-semibold">{t('account.orderNumber')}</th>
                <th className="px-4 py-3 font-semibold">{t('account.orderDate')}</th>
                <th className="px-4 py-3 font-semibold">{t('account.orderItems')}</th>
                <th className="px-4 py-3 font-semibold">{t('account.orderTotal')}</th>
                <th className="px-4 py-3 font-semibold">{t('account.orderStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((o, i) => (
                <tr key={o.id} className={i % 2 ? 'bg-surface-muted' : 'bg-surface'}>
                  <td className="px-4 py-3 font-semibold text-primary">{o.orderNumber}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {new Date(o.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {t(o.items.length === 1 ? 'account.itemCount_one' : 'account.itemCount_other', {
                      count: o.items.length,
                    })}
                  </td>
                  <td className="px-4 py-3 font-semibold text-ink">{formatPrice(o.subtotal)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[o.status]}>{t(STATUS_KEY[o.status])}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
