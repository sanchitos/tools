import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { Loader } from '../ui/Loader.js';

const link = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-2 text-body-md transition-colors ${
    isActive
      ? 'bg-accent font-semibold text-accent-fg'
      : 'font-medium text-white/85 hover:bg-white/15 hover:text-white'
  }`;

/** Protected admin shell: requires an admin session, renders sidebar + outlet. */
export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader /></div>;
  if (!user) return <Navigate to="/admin/login" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col bg-primary-dark">
        <div className="flex items-baseline gap-1 px-5 py-5 font-display text-headline-md font-bold">
          <span className="text-white">TOOLS</span>
          <span className="text-accent">JA</span>
          <span className="ml-1 text-label-sm font-normal uppercase tracking-wide text-white/60">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavLink to="/admin" end className={link}>Products</NavLink>
          <NavLink to="/admin/categories" className={link}>Categories</NavLink>
          <NavLink to="/admin/brands" className={link}>Brands</NavLink>
        </nav>
        <div className="space-y-1 border-t border-white/15 px-3 py-3">
          <a href="/" className="block rounded px-3 py-2 text-body-md text-white/85 hover:bg-white/15 hover:text-white">
            View site ↗
          </a>
          <div className="px-3 pt-2 text-label-sm text-white/60">{user.email}</div>
          <button
            onClick={async () => {
              await logout();
              navigate('/admin/login');
            }}
            className="block w-full rounded px-3 py-2 text-left text-body-md text-white/85 hover:bg-white/15 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
