import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.js';
import { ApiError } from '../lib/api.js';
import { AuthCard } from '../components/AuthCard.js';
import { ResendConfirmation } from '../components/ResendConfirmation.js';
import { Loader } from '../components/ui/index.js';
import { useT } from '../i18n/LocaleContext.js';

/**
 * Landing page for the emailed confirmation link. It POSTs the token to
 * Express, which verifies it and sets the session cookies — the browser never
 * holds a token, exactly as on /login.
 *
 * The token is single-use, so the POST is fired ONCE: React StrictMode runs
 * effects twice in development, and a second attempt would fail against a
 * token the first attempt just consumed, showing an error after a success.
 */
export default function ConfirmEmailPage() {
  const t = useT();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { confirmEmail } = useAuth();
  const token = sp.get('token') ?? '';
  const type = sp.get('type') === 'magiclink' ? 'magiclink' : 'signup';
  const [error, setError] = useState<string | null>(
    token ? null : t('auth.confirmMissingToken'),
  );
  const fired = useRef(false);

  useEffect(() => {
    if (!token || fired.current) return;
    fired.current = true;
    confirmEmail(token, type)
      .then(() => navigate('/account', { replace: true }))
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : t('auth.error.generic')),
      );
  }, [token, type, confirmEmail, navigate, t]);

  if (!error) {
    return (
      <AuthCard title={t('auth.confirming')}>
        <div className="flex justify-center py-4">
          <Loader />
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t('auth.confirmFailedTitle')} subtitle={error}>
      <ResendConfirmation />
    </AuthCard>
  );
}
