import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import {
  Badge,
  Breadcrumbs,
  Container,
  ImageWithFallback,
  Icon,
  Loader,
  Rail,
  Stars,
} from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';
import { formatPrice } from '../lib/format.js';
import { whatsappUrl } from '../lib/contact.js';
import { useCart } from '../context/CartContext.js';
import { useT } from '../i18n/LocaleContext.js';

const TRUST_STRIP = [
  { icon: 'truck' as const, key: 'product.trust.delivery' as const },
  { icon: 'shield' as const, key: 'product.trust.genuine' as const },
  { icon: 'headset' as const, key: 'product.trust.advice' as const },
];

export default function ProductDetailPage() {
  const t = useT();
  const { slug = '' } = useParams();
  const { data: product, loading, error } = useAsync(() => api.product(slug), [slug]);
  const [activeImg, setActiveImg] = useState(0);
  const [tab, setTab] = useState<'description' | 'specs'>('description');
  const [barVisible, setBarVisible] = useState(false);
  const [qty, setQtyState] = useState(1);
  const buyBoxRef = useRef<HTMLDivElement>(null);
  const { add, open: openCart } = useCart();

  useEffect(() => {
    const el = buyBoxRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setBarVisible(!entry.isIntersecting);
      },
      { rootMargin: '-64px 0px 0px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [product]);

  useEffect(() => {
    document.body.classList.toggle('has-sticky-buybar', barVisible);
    return () => document.body.classList.remove('has-sticky-buybar');
  }, [barVisible]);

  useEffect(() => {
    if (product && !product.description && product.specs.length > 0) setTab('specs');
  }, [product]);

  if (loading) return <Loader className="min-h-[50vh]" />;
  if (error || !product) {
    return (
      <Container className="py-24 text-center">
        <h1 className="font-display text-headline-lg text-primary">{t('product.notFound')}</h1>
        <p className="mt-3 text-body-md text-ink-muted">{error ?? t('product.notFoundBody')}</p>
        <Link to="/shop" className="mt-6 inline-block text-label-lg font-semibold text-accent hover:underline">
          {t('product.backToShop')}
        </Link>
      </Container>
    );
  }

  const images = product.images.length ? product.images : product.primaryImage ? [product.primaryImage] : [];
  const active = images[activeImg] ?? product.primaryImage ?? null;
  const outOfStock = product.stock <= 0;
  const maxQty = Math.max(1, product.stock);
  const enquiryMessage = t('product.enquiryMessage', {
    name: product.name,
    ref: product.sku ?? product.slug,
  });

  const setQty = (n: number) => setQtyState(Math.min(maxQty, Math.max(1, n)));
  const addToCart = () => {
    if (outOfStock) return;
    add(product, qty);
    openCart();
  };

  return (
    <Container className="py-8">
      <Breadcrumbs
        items={[
          { label: t('common.home'), to: '/' },
          { label: t('common.shop'), to: '/shop' },
          ...(product.category
            ? [{ label: product.category.label, to: `/shop?category=${product.category.slug}` }]
            : []),
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 gap-10 lg:grid-cols-[58fr_37fr]">
        {/* Gallery */}
        <div className="flex flex-col-reverse gap-3 lg:flex-row">
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto lg:w-20 lg:shrink-0 lg:flex-col lg:overflow-visible">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImg(i)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded border-2 ${i === activeImg ? 'border-primary' : 'border-border'}`}
                  aria-label={t('product.viewImage', { n: i + 1 })}
                >
                  <ImageWithFallback src={img.url} alt={img.altText ?? ''} className="h-full w-full" imgClassName="object-contain" />
                </button>
              ))}
            </div>
          )}
          <div className="relative flex-1">
            <ImageWithFallback
              src={active?.url}
              alt={active?.altText ?? product.name}
              className="aspect-square rounded-card border border-border"
              imgClassName="object-contain p-4"
            />
            {images.length > 1 && (
              <>
                <button
                  aria-label={t('product.previousImage')}
                  onClick={() => setActiveImg((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface/90 p-2 shadow-sm hover:bg-surface"
                >
                  <Icon name="chevronLeft" className="text-xl text-ink" />
                </button>
                <button
                  aria-label={t('product.nextImage')}
                  onClick={() => setActiveImg((i) => (i + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-border bg-surface/90 p-2 shadow-sm hover:bg-surface"
                >
                  <Icon name="chevronRight" className="text-xl text-ink" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Info */}
        <div>
          {product.sku && (
            <span className="text-label-xs text-ink-muted">{t('common.sku', { sku: product.sku })}</span>
          )}
          <h1 className="mt-1 font-display text-headline-sm font-bold text-ink">{product.name}</h1>
          <p className="mt-1 text-body-sm text-ink-muted">
            {t('common.soldBy', { brand: product.brand?.name ?? 'Tools Jamaica' })}
          </p>

          {product.reviewCount > 0 && (
            <div className="mt-2">
              <Stars
                rating={product.rating}
                count={product.reviewCount}
                ariaLabel={t('common.starsAria', { rating: product.rating })}
              />
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <span className="text-display-md font-bold text-accent">{formatPrice(product.price)}</span>
            {outOfStock ? (
              <Badge tone="error">{t('common.outOfStock')}</Badge>
            ) : (
              <Badge tone="success">{t('common.inStock')}</Badge>
            )}
          </div>

          {product.shortDescription && (
            <p className="mt-4 text-body-md text-ink-muted">{product.shortDescription}</p>
          )}

          {product.highlights.length > 0 && (
            <ul className="mt-5 space-y-2">
              {product.highlights.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-body-sm text-ink">
                  <Icon name="check" className="mt-0.5 shrink-0 text-accent" />
                  {h.text}
                </li>
              ))}
            </ul>
          )}

          {/* Buy box */}
          <div ref={buyBoxRef} className="mt-6 rounded-card border border-border p-4 shadow-card">
            <h3 className="text-headline-sm text-ink">{t('product.getThisProduct')}</h3>

            {!outOfStock && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-label-sm font-semibold text-ink-muted">{t('product.quantity')}</span>
                <div className="flex h-10 items-center rounded border border-border">
                  <button
                    onClick={() => setQty(qty - 1)}
                    disabled={qty <= 1}
                    aria-label={t('common.decreaseQuantity')}
                    className="h-full px-3 text-ink disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center text-body-md">{qty}</span>
                  <button
                    onClick={() => setQty(qty + 1)}
                    disabled={qty >= maxQty}
                    aria-label={t('common.increaseQuantity')}
                    className="h-full px-3 text-ink disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <button
                onClick={addToCart}
                disabled={outOfStock}
                className="flex w-full items-center justify-center gap-2 rounded bg-primary py-3 text-label-lg font-semibold text-primary-fg transition-colors hover:bg-primary-dark disabled:pointer-events-none disabled:opacity-50"
              >
                <Icon name="cart" />
                {outOfStock ? t('common.outOfStock') : t('common.addToCart')}
              </button>
              <a
                href={whatsappUrl(enquiryMessage)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded border-2 border-primary py-3 text-label-lg font-semibold text-primary hover:bg-surface-muted"
              >
                <Icon name="whatsapp" />
                {t('product.enquireWhatsapp')}
              </a>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mt-6 space-y-2">
            {TRUST_STRIP.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-body-sm text-ink-muted">
                <Icon name={item.icon} className="text-primary" />
                {t(item.key)}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sticky mini buy-bar */}
      {barVisible && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface p-3 shadow-pop lg:bottom-auto lg:top-16">
          <Container className="flex items-center gap-3">
            <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded sm:block">
              <ImageWithFallback
                src={product.primaryImage?.url}
                alt=""
                className="h-full w-full"
                imgClassName="object-contain"
              />
            </div>
            <span className="line-clamp-1 flex-1 text-body-sm font-semibold text-ink">{product.name}</span>
            <span className="hidden text-headline-md font-bold text-accent sm:inline">
              {formatPrice(product.price)}
            </span>
            <button
              onClick={addToCart}
              disabled={outOfStock}
              className="flex shrink-0 items-center gap-2 rounded bg-primary px-4 py-2 text-label-sm font-semibold text-primary-fg hover:bg-primary-dark disabled:pointer-events-none disabled:opacity-50"
            >
              <Icon name="cart" />
              {outOfStock ? t('common.outOfStock') : t('common.addToCart')}
            </button>
          </Container>
        </div>
      )}

      {/* Description / Specifications */}
      {(product.description || product.specs.length > 0) && (
        <div className="mx-auto mt-14 max-w-4xl rounded-card border border-border bg-surface p-6">
          <div className="flex justify-center gap-8 border-b border-border">
            {product.description && (
              <button
                onClick={() => setTab('description')}
                className={`pb-3 text-label-lg font-semibold ${tab === 'description' ? 'border-b-2 border-primary text-primary' : 'text-ink-muted'}`}
              >
                {t('product.description')}
              </button>
            )}
            {product.specs.length > 0 && (
              <button
                onClick={() => setTab('specs')}
                className={`pb-3 text-label-lg font-semibold ${tab === 'specs' ? 'border-b-2 border-primary text-primary' : 'text-ink-muted'}`}
              >
                {t('product.specifications')}
              </button>
            )}
          </div>

          <div className="pt-6">
            {tab === 'description' && product.description && (
              <p className="whitespace-pre-line text-body-md leading-relaxed text-ink-muted">
                {product.description}
              </p>
            )}
            {tab === 'specs' && product.specs.length > 0 && (
              <table className="w-full border-collapse text-body-md">
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={s.id} className={i % 2 ? 'bg-surface-muted' : ''}>
                      <th className="w-1/2 border border-border px-3 py-2 text-left font-semibold text-ink">
                        {s.label}
                      </th>
                      <td className="border border-border px-3 py-2 text-ink-muted">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Related */}
      {product.related.length > 0 && (
        <div className="mt-16">
          <Rail
            title={t('product.recommended')}
            scrollLeftLabel={t('common.scrollLeft')}
            scrollRightLabel={t('common.scrollRight')}
          >
            {product.related.map((p) => (
              <div key={p.id} className="w-[220px] shrink-0 snap-start">
                <ProductCard product={p} />
              </div>
            ))}
          </Rail>
        </div>
      )}
    </Container>
  );
}
