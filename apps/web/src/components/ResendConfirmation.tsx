import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.js';
import { Input } from './ui/index.js';
import { useT } from '../i18n/LocaleContext.js';

/**
 * "Send me another link". Shared by the signup success panel, the login page's
 * EMAIL_NOT_CONFIRMED branch and the failed-confirmation page.
 *
 * The endpoint answers 204 no matter what — it must not reveal whether an
 * address is registered — so this never reports an error, only "sent". When
 * `email` is supplied (we already know it) the field is hidden entirely.
 */
export function ResendConfirmation({ email }: { email?: string }) {
  const t = useT();
  const [value, setValue] = useState(email ?? '');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(value.trim())) return;
    setBusy(true);
    try {
      await api.resendConfirmation(value.trim());
      setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-body-sm text-success">{t('auth.resent')}</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {!email && (
        <>
          <p className="text-body-sm text-ink-muted">{t('auth.resendPrompt')}</p>
          <Input
            type="email"
            autoComplete="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('auth.emailPlaceholder')}
          />
        </>
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded border border-primary px-4 py-2 text-label-sm font-semibold text-primary hover:bg-primary hover:text-primary-fg disabled:opacity-60"
      >
        {busy ? t('auth.resending') : t('auth.resend')}
      </button>
    </form>
  );
}
