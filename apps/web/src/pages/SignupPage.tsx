import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api.js';
import { useAuth } from '../context/AuthContext.js';
import { AuthCard } from '../components/AuthCard.js';
import { Input } from '../components/ui/index.js';
import { useT } from '../i18n/LocaleContext.js';
import { ResendConfirmation } from '../components/ResendConfirmation.js';

/**
 * Public self-signup. A successful POST returns 202 and sets NO cookies — the
 * account is unconfirmed until the emailed link is opened — so this page swaps
 * to a "check your inbox" panel rather than navigating anywhere.
 */
export default function SignupPage() {
  const t = useT();
  const { user, loading } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (!loading && user) return <Navigate to="/account" replace />;

  if (sentTo) {
    return (
      <AuthCard title={t('auth.checkInboxTitle')} subtitle={t('auth.checkInboxBody', { email: sentTo })}>
        <ResendConfirmation email={sentTo} />
      </AuthCard>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('auth.error.emailRequired'));
    if (password.length < 8) return setError(t('auth.error.passwordLength'));
    if (password !== confirm) return setError(t('auth.error.passwordMismatch'));

    setBusy(true);
    try {
      const res = await api.signup({
        email: email.trim(),
        password,
        fullName: fullName.trim() || undefined,
      });
      setSentTo(res.email);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('auth.error.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard
      title={t('auth.signupTitle')}
      subtitle={t('auth.signupSubtitle')}
      footer={
        <>
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="signup-name">
            {t('auth.fullName')}
          </label>
          <Input
            id="signup-name"
            className="mt-1"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder={t('auth.fullNamePlaceholder')}
          />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="signup-email">
            {t('auth.email')}
          </label>
          <Input
            id="signup-email"
            className="mt-1"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
          />
        </div>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="signup-password">
            {t('auth.password')}
          </label>
          <Input
            id="signup-password"
            className="mt-1"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-label-sm text-ink-muted">{t('auth.passwordHint')}</p>
        </div>
        <div>
          <label className="text-label-sm font-semibold text-ink" htmlFor="signup-confirm">
            {t('auth.confirmPassword')}
          </label>
          <Input
            id="signup-confirm"
            className="mt-1"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>

        {error && (
          <p className="rounded border border-error/30 bg-error-container px-3 py-2 text-body-sm text-error-onContainer">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded bg-accent py-3 text-label-lg font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? t('auth.creatingAccount') : t('auth.createAccount')}
        </button>
      </form>
    </AuthCard>
  );
}
