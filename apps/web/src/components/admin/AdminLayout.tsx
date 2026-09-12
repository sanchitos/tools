import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.js';
import { Loader } from '../ui/Loader.js';
import { Logo } from '../Logo.js';

const link = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-2 text-body-md transition-colors ${
    isActive
      ? 'bg-accent font-semibold text-accent-fg'
      : 'font-medium text-white/85 hover:bg-white/15 hover:text-white'
  }`;

/**
 * Protected admin shell: requires an ADMIN session, renders sidebar + outlet.
 *
 * The role check is not redundant with the API's requireRole. Until customers
 * could log in, any session here was an admin session; now a signed-in shopper
 * hitting /admin would otherwise see the whole back-office chrome with every
 * panel failing on a 403. Send them to their own account page instead.
 */
export function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  if (loading) return <div className="flex min-h-screen items-center justify-center"><Loader /></div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/account" replace />;

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-60 shrink-0 flex-col bg-primary-dark">
        <div className="flex items-center gap-2 px-5 py-5">
          <Logo variant="compact" />
          <span className="text-label-sm font-normal uppercase tracking-wide text-white/60">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <NavLink to="/admin/orders" className={link}>Orders</NavLink>
          <NavLink to="/admin" end className={link}>Products</NavLink>
          <NavLink to="/admin/categories" className={link}>Categories</NavLink>
          <NavLink to="/admin/brands" className={link}>Brands</NavLink>
          <NavLink to="/admin/homepage" className={link}>Homepage</NavLink>
          <NavLink to="/admin/locations" className={link}>Locations</NavLink>
          <NavLink to="/admin/users" className={link}>Users</NavLink>
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
