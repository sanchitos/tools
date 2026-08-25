import { Link } from 'react-router-dom';
import { Drawer } from './ui/Drawer.js';
import { ImageWithFallback } from './ui/ImageWithFallback.js';
import { Icon } from './ui/Icon.js';
import { Loader } from './ui/Loader.js';
import { useAsync } from '../lib/useAsync.js';
import { api } from '../lib/api.js';

/**
 * Left slide-in "all departments" drawer, fed by /categories. Categories are
 * flat (no parentId), so this is a single-level list, not a mega-menu.
 */
export function DepartmentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: categories, loading, error } = useAsync(() => api.categories(), []);

  return (
    <Drawer open={open} side="left" title="All departments" onClose={onClose}>
      <nav className="flex flex-col">
        <Link
          to="/shop"
          onClick={onClose}
          className="flex items-center justify-between border-b border-border px-4 py-3 text-label-lg font-semibold text-primary hover:bg-surface-muted"
        >
          Shop all products
          <Icon name="chevronRight" className="text-ink-muted" />
        </Link>

        {loading && <Loader />}
        {error && <p className="p-4 text-body-sm text-error">{error}</p>}

        {categories?.map((category) => (
          <Link
            key={category.id}
            to={`/shop?category=${category.slug}`}
            onClick={onClose}
            className="flex items-center gap-3 border-b border-border px-4 py-3 hover:bg-surface-muted"
          >
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded bg-surface-strong">
              {category.imageUrl ? (
                <ImageWithFallback src={category.imageUrl} alt="" className="h-full w-full" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-ink-muted">
                  <Icon name="wrench" />
                </div>
              )}
            </div>
            <span className="flex-1 text-body-sm text-ink">{category.label}</span>
            {typeof category.productCount === 'number' && (
              <span className="text-label-sm text-ink-muted">{category.productCount}</span>
            )}
            <Icon name="chevronRight" className="text-ink-muted" />
          </Link>
        ))}
      </nav>
    </Drawer>
  );
}
