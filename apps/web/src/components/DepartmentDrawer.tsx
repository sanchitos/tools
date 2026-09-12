import { Link } from 'react-router-dom';
import { Drawer } from './ui/Drawer.js';
import { ImageWithFallback } from './ui/ImageWithFallback.js';
import { Icon } from './ui/Icon.js';
import { Loader } from './ui/Loader.js';
import { useAsync } from '../lib/useAsync.js';
import { api } from '../lib/api.js';
import { LocaleSwitcher } from './LocaleSwitcher.js';
import { useT } from '../i18n/LocaleContext.js';

/**
 * Left slide-in "all departments" drawer, fed by /categories. Categories are
 * a two-level hierarchy (parentId): each top-level department is listed with
 * its subcategories indented beneath it.
 */
export function DepartmentDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const { data: categories, loading, error } = useAsync(() => api.categories(), []);
  const topLevel = (categories ?? []).filter((c) => c.parentId === null);
  const childrenOf = (parentId: string) => (categories ?? []).filter((c) => c.parentId === parentId);

  return (
    <Drawer
      open={open}
      side="left"
      title={t('departments.title')}
      onClose={onClose}
      closeLabel={t('common.close')}
    >
      <nav className="flex flex-col">
        {/* The tier-3 promo bar that holds the desktop switcher is lg-only. */}
        <div className="flex justify-end border-b border-border px-4 py-3 lg:hidden">
          <LocaleSwitcher />
        </div>

        <Link
          to="/shop"
          onClick={onClose}
          className="flex items-center justify-between border-b border-border px-4 py-3 text-label-lg font-semibold text-primary hover:bg-surface-muted"
        >
          {t('departments.shopAll')}
          <Icon name="chevronRight" className="text-ink-muted" />
        </Link>

        {loading && <Loader />}
        {error && <p className="p-4 text-body-sm text-error">{error}</p>}

        {topLevel.map((category) => (
          <div key={category.id} className="border-b border-border">
            <Link
              to={`/shop?category=${category.slug}`}
              onClick={onClose}
              className="flex items-center gap-3 px-4 py-3 hover:bg-surface-muted"
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

            {childrenOf(category.id).length > 0 && (
              <div className="pb-2">
                {childrenOf(category.id).map((child) => (
                  <Link
                    key={child.id}
                    to={`/shop?category=${child.slug}`}
                    onClick={onClose}
                    className="flex items-center justify-between py-2 pl-16 pr-4 text-body-sm text-ink-muted hover:bg-surface-muted hover:text-ink"
                  >
                    {child.label}
                    {typeof child.productCount === 'number' && <span className="text-label-sm">{child.productCount}</span>}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>
    </Drawer>
  );
}
