import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../lib/api.js';
import { AuthCard } from '../components/AuthCard.js';
import { ResendConfirmation } from '../components/ResendConfirmation.js';
import { Input } from '../components/ui/index.js';
import { useT } from '../i18n/LocaleContext.js';

/**
 * Customer-facing sibling of AdminLoginPage. One session cookie serves both, so
 * an admin who signs in here lands in the back office instead of /account.
 */
export default function LoginPage() {
  const t = useT();
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to={user.role === 'admin' ? '/admin' : '/account'} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setUnconfirmed(false);
    setBusy(true);
    try {
      const profile = await login(email.trim(), password);
      navigate(profile.role === 'admin' ? '/admin' : '/account', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_CONFIRMED') {
        setUnconfirmed(true);
        setError(t('auth.notConfirmed'));
      } else {
        setError(err instanceof ApiError ? err.message : t('auth.error.generic'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/signup" className="font-semibold text-primary hover:underline">
            {t('auth.createAccount')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="login-email">
            {t('auth.email')}
          </label>
          <Input
            id="login-email"
            className="mt-1"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
          />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="login-password">
            {t('auth.password')}
          </label>
          <Input
            id="login-password"
            className="mt-1"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded border border-error/30 bg-error-container px-3 py-2 text-body-sm text-error-onContainer">
            <p>{error}</p>
            {unconfirmed && (
              <div className="mt-3">
                <ResendConfirmation email={email.trim()} />
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-primary py-3 text-label-lg font-semibold text-primary-fg hover:bg-primary-dark disabled:opacity-60"
        >
          {busy ? t('auth.signingIn') : t('auth.signIn')}
        </button>
      </form>
    </AuthCard>
  );
}
