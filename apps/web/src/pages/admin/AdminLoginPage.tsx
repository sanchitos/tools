import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { ApiError } from '../../lib/api.js';
import { Button } from '../../components/ui/Button.js';

/** Admin login — utilitarian, uses the Stitch tokens. */
export default function AdminLoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/admin" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-inverse px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-8 shadow-pop">
        <div className="mb-6 flex items-baseline gap-1 font-display text-headline-md font-bold">
          <span className="text-primary">TOOLS</span>
          <span className="text-accent">JAMAICA</span>
        </div>
        <h1 className="text-headline-md text-ink">Admin sign in</h1>
        <p className="mt-1 text-body-md text-ink-muted">Manage the product catalog.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink focus:border-primary"
            />
          </div>

          {error && (
            <p className="rounded border border-error/30 bg-error-container px-3 py-2 text-body-md text-error-onContainer">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
