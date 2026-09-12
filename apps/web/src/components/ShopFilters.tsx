import type { BrandDTO, CategoryDTO } from '@tools-jamaica/shared';
import { Accordion, Input } from './ui/index.js';
import { useT } from '../i18n/LocaleContext.js';

interface Props {
  categories: CategoryDTO[];
  brands: BrandDTO[];
  selectedCategories: string[];
  selectedBrands: string[];
  minPrice: string;
  maxPrice: string;
  inStock: boolean;
  onToggleCategory: (slug: string) => void;
  onToggleBrand: (slug: string) => void;
  onMinPriceChange: (value: string) => void;
  onMaxPriceChange: (value: string) => void;
  onToggleInStock: () => void;
}

/** Shared filter facet set — rendered in the desktop rail and the mobile drawer. */
export function ShopFilters({
  categories,
  brands,
  selectedCategories,
  selectedBrands,
  minPrice,
  maxPrice,
  inStock,
  onToggleCategory,
  onToggleBrand,
  onMinPriceChange,
  onMaxPriceChange,
  onToggleInStock,
}: Props) {
  const t = useT();

  return (
    <div className="px-4 lg:px-0">
      <Accordion title={t('shop.filter.category')} defaultOpen>
        <div className="space-y-3">
          {categories
            .filter((c) => c.parentId === null)
            .map((parent) => {
              const children = categories.filter((c) => c.parentId === parent.id);
              return (
                <div key={parent.id}>
                  <Check
                    label={parent.label}
                    checked={selectedCategories.includes(parent.slug)}
                    onChange={() => onToggleCategory(parent.slug)}
                  />
                  {children.length > 0 && (
                    <div className="ml-6 mt-1.5 space-y-1.5">
                      {children.map((child) => (
                        <Check
                          key={child.id}
                          label={child.label}
                          checked={selectedCategories.includes(child.slug)}
                          onChange={() => onToggleCategory(child.slug)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </Accordion>

      <Accordion title={t('shop.filter.brand')} defaultOpen>
        <div className="space-y-1.5">
          {brands.length === 0 ? (
            <p className="text-body-sm text-ink-muted">{t('shop.filter.noBrands')}</p>
          ) : (
            brands.map((b) => (
              <Check
                key={b.id}
                label={b.name}
                checked={selectedBrands.includes(b.slug)}
                onChange={() => onToggleBrand(b.slug)}
              />
            ))
          )}
        </div>
      </Accordion>

      <Accordion title={t('shop.filter.price')}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            value={minPrice}
            placeholder={t('shop.filter.min')}
            onChange={(e) => onMinPriceChange(e.target.value)}
          />
          <span className="text-ink-muted">–</span>
          <Input
            type="number"
            inputMode="numeric"
            value={maxPrice}
            placeholder={t('shop.filter.max')}
            onChange={(e) => onMaxPriceChange(e.target.value)}
          />
        </div>
      </Accordion>

      <div className="py-3">
        <Check label={t('shop.filter.inStockOnly')} checked={inStock} onChange={onToggleInStock} />
      </div>
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-body-sm text-ink">
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
