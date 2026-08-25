import { Icon } from './Icon.js';

/** 5-star rating row. Renders nothing when rating <= 0 (unseeded products). */
export function Stars({
  rating,
  count,
  size = 'md',
}: {
  rating: number;
  count?: number;
  size?: 'sm' | 'md';
}) {
  if (rating <= 0) return null;
  const sizeClass = size === 'sm' ? 'text-body-sm' : 'text-body-lg';

  return (
    <div className="flex items-center gap-1 text-accent" aria-label={`Rated ${rating} out of 5`}>
      <span className={`flex ${sizeClass}`}>
        {Array.from({ length: 5 }, (_, i) => {
          const diff = rating - i;
          const name = diff >= 1 ? 'star' : diff >= 0.5 ? 'starHalf' : 'star';
          const filled = diff >= 0.5;
          return (
            <Icon
              key={i}
              name={name}
              className={filled ? 'fill-current stroke-current' : 'stroke-current text-border-strong'}
            />
          );
        })}
      </span>
      {typeof count === 'number' && <span className="text-label-sm text-ink-muted">({count})</span>}
    </div>
  );
}
