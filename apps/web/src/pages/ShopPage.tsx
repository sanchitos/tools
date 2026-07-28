import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProductListQuery, ProductSort } from '@tools-jamaica/shared';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { Button, Container, Loader, Select } from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';

const PAGE_SIZE = 12;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS = [
  { value: 'featured', label: 'Featured' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'name', label: 'Name A–Z' },
];

// Only offered while a search is active — relevance ranking has no meaning
// against the plain browse listing (see catalog/service.ts listProductsPlain).
const RELEVANCE_OPTION = { value: 'relevance', label: 'Relevance' };

export default function ShopPage() {
  const [sp, setSp] = useSearchParams();
  const categories = useAsync(() => api.categories(), []);
  const brands = useAsync(() => api.brands(), []);

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

  const total = products.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilters =
    selectedCategories.length + selectedBrands.length + (inStock ? 1 : 0) + (minPrice || maxPrice ? 1 : 0);

  return (
    <Container className="py-10">
      <h1 className="font-display text-headline-lg text-primary">Shop</h1>

      {/* Top bar: search + sort */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={searchInput}
          placeholder="Search products…"
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded border border-border bg-surface px-3 py-2 text-body-md text-ink placeholder:text-ink-muted sm:max-w-xs"
        />
        <div className="flex items-center gap-2">
          <span className="text-label-sm font-semibold uppercase tracking-wide text-ink-muted">Sort</span>
          <div className="w-52">
            <Select
              ariaLabel="Sort products"
              value={sort}
              options={q ? [RELEVANCE_OPTION, ...SORT_OPTIONS] : SORT_OPTIONS}
              onChange={(v) => update((next) => next.set('sort', v))}
            />
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[240px_1fr]">
        {/* Filters */}
        <aside className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-label-lg font-semibold uppercase tracking-wide text-primary">Filters</h2>
            {activeFilters > 0 && (
              <button
                onClick={() =>
                  setSp(
                    // Drop q too (search is a filter here), and don't carry over
                    // 'relevance' — it's meaningless once the search is gone.
                    new URLSearchParams(sort !== 'featured' && sort !== 'relevance' ? { sort } : {}),
                    { replace: true },
                  )
                }
                className="text-label-sm text-accent hover:underline"
              >
                Clear all
              </button>
            )}
          </div>

          <FilterGroup title="Category">
            {(categories.data ?? []).map((c) => (
              <Check
                key={c.id}
                label={c.label}
                checked={selectedCategories.includes(c.slug)}
                onChange={() => toggleMulti('category', c.slug)}
              />
            ))}
          </FilterGroup>

          <FilterGroup title="Brand">
            {(brands.data ?? []).length === 0 ? (
              <p className="text-body-md text-ink-muted">No brands</p>
            ) : (
              (brands.data ?? []).map((b) => (
                <Check
                  key={b.id}
                  label={b.name}
                  checked={selectedBrands.includes(b.slug)}
                  onChange={() => toggleMulti('brand', b.slug)}
                />
              ))
            )}
          </FilterGroup>

          <FilterGroup title="Price (J$)">
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                value={minPrice}
                placeholder="Min"
                onChange={(e) => update((next) => (e.target.value ? next.set('minPrice', e.target.value) : next.delete('minPrice')))}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-body-md"
              />
              <span className="text-ink-muted">–</span>
              <input
                type="number"
                inputMode="numeric"
                value={maxPrice}
                placeholder="Max"
                onChange={(e) => update((next) => (e.target.value ? next.set('maxPrice', e.target.value) : next.delete('maxPrice')))}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-body-md"
              />
            </div>
          </FilterGroup>

          <Check
            label="In stock only"
            checked={inStock}
            onChange={() => update((next) => (inStock ? next.delete('inStock') : next.set('inStock', 'true')))}
          />
        </aside>

        {/* Results */}
        <div>
          {products.loading ? (
            <Loader />
          ) : products.error ? (
            <p className="text-error">{products.error}</p>
          ) : total === 0 ? (
            <div className="rounded-card border border-dashed border-border py-20 text-center">
              <p className="text-body-lg text-ink-muted">No products match your filters.</p>
            </div>
          ) : (
            <>
              <p className="mb-4 text-body-md text-ink-muted">
                {total} {total === 1 ? 'product' : 'products'}
              </p>
              <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 xl:grid-cols-3">
                {(products.data?.items ?? []).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-10 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => update((next) => next.set('page', String(page - 1)), false)}
                  >
                    Prev
                  </Button>
                  <span className="text-body-md text-ink-muted">
                    Page {page} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => update((next) => next.set('page', String(page + 1)), false)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Container>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-label-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body-md text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 rounded border-border text-primary accent-[color:var(--color-primary)]"
      />
      {label}
    </label>
  );
}
