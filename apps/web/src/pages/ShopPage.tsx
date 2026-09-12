import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProductListQuery, ProductSort } from '@tools-jamaica/shared';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import {
  Breadcrumbs,
  Container,
  Drawer,
  Pagination,
  Select,
  Skeleton,
} from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';
import { ShopFilters } from '../components/ShopFilters.js';
import { useT } from '../i18n/LocaleContext.js';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

export default function ShopPage() {
  const t = useT();
  const [sp, setSp] = useSearchParams();

  const sortOptions = [
    { value: 'featured', label: t('shop.sort.featured') },
    { value: 'price-asc', label: t('shop.sort.priceAsc') },
    { value: 'price-desc', label: t('shop.sort.priceDesc') },
    { value: 'name', label: t('shop.sort.name') },
  ];
  // Only offered while a search is active — relevance ranking has no meaning
  // against the plain browse listing (see catalog/service.ts listProductsPlain).
  const relevanceOption = { value: 'relevance', label: t('shop.sort.relevance') };
  const categories = useAsync(() => api.categories(), []);
  const brands = useAsync(() => api.brands(), []);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const selectedCategories = sp.getAll('category');
  const selectedBrands = sp.getAll('brand');
  const q = sp.get('q') ?? '';
  // Mirrors the server default in catalog/service.ts listProducts(): an unset
  // sort defaults to relevance while searching, featured otherwise. An
  // explicit ?sort= always wins over both.
  const sort = (sp.get('sort') as ProductSort) || (q ? 'relevance' : 'featured');
  const inStock = sp.get('inStock') === 'true';
  const minPrice = sp.get('minPrice') ?? '';
  const maxPrice = sp.get('maxPrice') ?? '';
  const page = Math.max(1, Number(sp.get('page') || '1'));

  const query: ProductListQuery = {
    q: q || undefined,
    category: selectedCategories.length ? selectedCategories : undefined,
    brand: selectedBrands.length ? selectedBrands : undefined,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined,
    inStock: inStock || undefined,
    sort,
    page,
    pageSize: PAGE_SIZE,
  };

  const products = useAsync(() => api.listProducts(query), [sp.toString()]);

  const update = (mutate: (next: URLSearchParams) => void, resetPage = true) => {
    const next = new URLSearchParams(sp);
    if (resetPage) next.delete('page');
    mutate(next);
    setSp(next, { replace: true });
  };

  // Debounced search: typing updates local state immediately (so the input
  // never lags), and only after a pause does it rewrite the URL — which is
  // what re-triggers the fetch via useAsync's [sp.toString()] dep. Without
  // this, every keystroke rewrote the URL and refired the query, and because
  // useAsync flips `loading` on each call, the whole grid unmounted and
  // flashed the Loader once per character.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => setSearchInput(q), [q]); // stay in sync when q changes externally (e.g. Clear all)
  useEffect(() => {
    if (searchInput === q) return;
    const handle = setTimeout(() => {
      update((next) => (searchInput ? next.set('q', searchInput) : next.delete('q')));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [searchInput]); // deliberately not depending on `update`/`q`: this should only re-run when the user types

  const toggleMulti = (key: 'category' | 'brand', value: string) =>
    update((next) => {
      const values = next.getAll(key);
      next.delete(key);
      const has = values.includes(value);
      for (const v of values) if (v !== value) next.append(key, v);
      if (!has) next.append(key, value);
    });

  const clearAll = () =>
    setSp(
      // Drop q too (search is a filter here), and don't carry over
      // 'relevance' — it's meaningless once the search is gone.
      new URLSearchParams(sort !== 'featured' && sort !== 'relevance' ? { sort } : {}),
      { replace: true },
    );

  const total = products.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters =
    selectedCategories.length + selectedBrands.length + (inStock ? 1 : 0) + (minPrice || maxPrice ? 1 : 0);

  const activeCategoryLabel =
    selectedCategories.length === 1
      ? (categories.data ?? []).find((c) => c.slug === selectedCategories[0])?.label
      : undefined;

  const topLevelCategories = (categories.data ?? []).filter((c) => c.parentId === null);

  const filtersProps = {
    categories: categories.data ?? [],
    brands: brands.data ?? [],
    selectedCategories,
    selectedBrands,
    minPrice,
    maxPrice,
    inStock,
    onToggleCategory: (slug: string) => toggleMulti('category', slug),
    onToggleBrand: (slug: string) => toggleMulti('brand', slug),
    onMinPriceChange: (v: string) => update((next) => (v ? next.set('minPrice', v) : next.delete('minPrice'))),
    onMaxPriceChange: (v: string) => update((next) => (v ? next.set('maxPrice', v) : next.delete('maxPrice'))),
    onToggleInStock: () => update((next) => (inStock ? next.delete('inStock') : next.set('inStock', 'true'))),
  };

  return (
    <Container className="py-6">
      <Breadcrumbs
        items={[
          { label: t('common.home'), to: '/' },
          { label: t('common.shop'), to: activeCategoryLabel ? '/shop' : undefined },
          ...(activeCategoryLabel ? [{ label: activeCategoryLabel }] : []),
        ]}
      />
      <h1 className="mt-2 font-display text-headline-lg text-primary">{t('shop.title')}</h1>

      {/* Department chip rail — top-level only; selecting one includes its subcategories (server-expanded). */}
      {topLevelCategories.length > 0 && (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {topLevelCategories.map((c) => {
            const selected = selectedCategories.includes(c.slug);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleMulti('category', c.slug)}
                className={`h-10 shrink-0 whitespace-nowrap rounded border px-4 text-body-xs transition-colors ${
                  selected
                    ? 'border-primary bg-surface-strong font-semibold text-primary'
                    : 'border-border text-ink-muted hover:border-border-strong'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Controls row */}
      <div className="mt-6">
        <div className="hidden items-center justify-between lg:flex">
          <p className="text-body-sm text-ink-muted">
            {t(total === 1 ? 'shop.count_one' : 'shop.count_other', { count: total })}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-label-sm font-semibold uppercase tracking-wide text-ink-muted">
              {t('shop.sortBy')}
            </span>
            <div className="w-52">
              <Select
                ariaLabel={t('shop.sortAria')}
                value={sort}
                options={q ? [relevanceOption, ...sortOptions] : sortOptions}
                onChange={(v) => update((next) => next.set('sort', v))}
              />
            </div>
          </div>
        </div>

        <div className="lg:hidden">
          <div className="grid grid-cols-2 gap-2">
            <Select
              ariaLabel={t('shop.sortAria')}
              value={sort}
              options={q ? [relevanceOption, ...sortOptions] : sortOptions}
              onChange={(v) => update((next) => next.set('sort', v))}
            />
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="relative flex items-center justify-center gap-2 rounded border border-border bg-surface px-3 py-2 text-body-sm text-ink"
            >
              {t('shop.filters')}
              {activeFilters > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-label-xs text-accent-fg">
                  {activeFilters}
                </span>
              )}
            </button>
          </div>
          <p className="mt-3 text-center text-body-sm text-ink-muted">
            {t(total === 1 ? 'shop.count_one' : 'shop.count_other', { count: total })}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[230px_1fr]">
        {/* Desktop filter rail */}
        <aside className="hidden lg:block">
          <div className="flex items-center justify-between px-0 pb-2">
            <h2 className="text-label-lg font-semibold uppercase tracking-wide text-primary">{t('shop.filters')}</h2>
            {activeFilters > 0 && (
              <button onClick={clearAll} className="text-label-sm text-accent hover:underline">
                {t('shop.clearAll')}
              </button>
            )}
          </div>
          <ShopFilters {...filtersProps} />
        </aside>

        {/* Mobile filter drawer */}
        <Drawer
          open={filtersOpen}
          side="right"
          title={t('shop.filters')}
          closeLabel={t('common.close')}
          onClose={() => setFiltersOpen(false)}
          footer={
            <div className="flex gap-3">
              <button
                onClick={clearAll}
                className="flex-1 rounded border-2 border-primary py-2.5 text-label-lg font-semibold text-primary"
              >
                {t('shop.clearAll')}
              </button>
              <button
                onClick={() => setFiltersOpen(false)}
                className="flex-1 rounded bg-primary py-2.5 text-label-lg font-semibold text-primary-fg"
              >
                {t('shop.apply')}
              </button>
            </div>
          }
        >
          <ShopFilters {...filtersProps} />
        </Drawer>

        {/* Results */}
        <div>
          {products.loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: PAGE_SIZE }, (_, i) => (
                <Skeleton key={i} className="aspect-[3/4]" />
              ))}
            </div>
          ) : products.error ? (
            <p className="text-error">{products.error}</p>
          ) : total === 0 ? (
            <div className="rounded-card border border-dashed border-border py-20 text-center">
              <p className="text-body-lg text-ink-muted">{t('shop.noResults')}</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {(products.data?.items ?? []).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-10">
                  <Pagination
                    page={page}
                    pageCount={totalPages}
                    onChange={(p) => update((next) => next.set('page', String(p)), false)}
                    labels={{
                      nav: t('pagination.nav'),
                      first: t('pagination.first'),
                      previous: t('pagination.previous'),
                      next: t('pagination.next'),
                      last: t('pagination.last'),
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Container>
  );
}
