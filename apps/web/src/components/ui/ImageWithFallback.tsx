import { useState } from 'react';

/**
 * Renders remote/product images with graceful degradation: a skeleton while
 * loading and a placeholder if the URL is broken. Never shows a browser broken
 * image icon (per the UI conventions).
 */
export function ImageWithFallback({
  src,
  alt,
  className = '',
  imgClassName = '',
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const showPlaceholder = !src || errored;

  return (
    <div className={`relative overflow-hidden bg-surface-strong ${className}`}>
      {!loaded && !showPlaceholder && (
        <div className="absolute inset-0 animate-pulse bg-surface-strong" aria-hidden="true" />
      )}
      {showPlaceholder ? (
        <div className="flex h-full w-full items-center justify-center text-border-strong" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
    </div>
  );
}
