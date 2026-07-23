import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { Badge, Container, ImageWithFallback, Loader } from '../components/ui/index.js';
import { ProductCard } from '../components/ProductCard.js';
import { formatPrice } from '../lib/format.js';

export default function ProductDetailPage() {
  const { slug = '' } = useParams();
  const { data: product, loading, error } = useAsync(() => api.product(slug), [slug]);
  const [activeImg, setActiveImg] = useState(0);

  if (loading) return <Loader className="min-h-[50vh]" />;
  if (error || !product) {
    return (
      <Container className="py-24 text-center">
        <h1 className="font-display text-headline-lg text-primary">Product not found</h1>
        <p className="mt-3 text-body-md text-ink-muted">{error ?? 'This product may have been removed.'}</p>
        <Link to="/shop" className="mt-6 inline-block text-label-lg font-semibold text-accent hover:underline">
          ← Back to shop
        </Link>
      </Container>
    );
  }

  const images = product.images.length ? product.images : product.primaryImage ? [product.primaryImage] : [];
  const active = images[activeImg] ?? product.primaryImage ?? null;
  const outOfStock = product.stock <= 0;

  return (
    <Container className="py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-label-sm text-ink-muted">
        <Link to="/shop" className="hover:text-primary">Shop</Link>
        {product.category && (
          <>
            <span className="mx-2">/</span>
            <Link to={`/shop?category=${product.category.slug}`} className="hover:text-primary">
              {product.category.label}
            </Link>
          </>
        )}
      </nav>

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        {/* Gallery */}
        <div>
          <ImageWithFallback
            src={active?.url}
            alt={active?.altText ?? product.name}
            className="aspect-square rounded-card border border-border"
          />
          {images.length > 1 && (
            <div className="mt-3 flex gap-3 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImg(i)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded border-2 ${i === activeImg ? 'border-primary' : 'border-border'}`}
                  aria-label={`View image ${i + 1}`}
                >
                  <ImageWithFallback src={img.url} alt={img.altText ?? ''} className="h-full w-full" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {product.brand && (
            <span className="text-label-lg font-semibold uppercase tracking-wide text-ink-muted">
              {product.brand.name}
            </span>
          )}
          <h1 className="mt-1 font-display text-headline-lg text-primary">{product.name}</h1>

          <div className="mt-4 flex items-center gap-3">
            <span className="text-display-lg font-bold text-accent">{formatPrice(product.price)}</span>
            {outOfStock ? (
              <Badge tone="error">Out of stock</Badge>
            ) : (
              <Badge tone="success">In stock</Badge>
            )}
          </div>

          {product.shortDescription && (
            <p className="mt-4 text-body-lg text-ink-muted">{product.shortDescription}</p>
          )}

          {product.highlights.length > 0 && (
            <ul className="mt-6 space-y-2">
              {product.highlights.map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-body-md text-ink">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-1 shrink-0 text-accent">
                    <path d="m5 13 4 4L19 7" />
                  </svg>
                  {h.text}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <span className="rounded bg-surface-muted px-4 py-3 text-body-md text-ink-muted">
              {product.sku ? `SKU: ${product.sku}` : 'Contact us to order'}
            </span>
          </div>
        </div>
      </div>

      {/* Description + specs */}
      {(product.description || product.specs.length > 0) && (
        <div className="mt-14 grid grid-cols-1 gap-10 lg:grid-cols-2">
          {product.description && (
            <div>
              <h2 className="font-display text-headline-md text-primary">Description</h2>
              <p className="mt-3 whitespace-pre-line text-body-md leading-relaxed text-ink-muted">
                {product.description}
              </p>
            </div>
          )}
          {product.specs.length > 0 && (
            <div>
              <h2 className="font-display text-headline-md text-primary">Specifications</h2>
              <table className="mt-3 w-full border-collapse text-body-md">
                <tbody>
                  {product.specs.map((s, i) => (
                    <tr key={s.id} className={i % 2 ? 'bg-surface-muted' : ''}>
                      <th className="w-1/2 border border-border px-3 py-2 text-left font-semibold text-ink">{s.label}</th>
                      <td className="border border-border px-3 py-2 text-ink-muted">{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Related */}
      {product.related.length > 0 && (
        <div className="mt-16">
          <h2 className="mb-6 font-display text-headline-lg text-primary">Related products</h2>
          <div className="grid grid-cols-1 gap-gutter sm:grid-cols-2 lg:grid-cols-4">
            {product.related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      )}
    </Container>
  );
}
