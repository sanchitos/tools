/** Intrinsic size of the trimmed lockup in `public/logo.png` (2.13:1). */
const NATURAL_W = 1522;
const NATURAL_H = 713;

/** Rendered heights, in px. `compact` suits dense chrome (admin sidebar). */
const HEIGHTS = { full: 44, compact: 32 } as const;

interface Props {
  variant?: keyof typeof HEIGHTS;
  className?: string;
}

/**
 * The Tools Jamaica lockup. The asset is genuinely transparent, so it drops
 * straight onto light or dark grounds with no backing chip. Width/height are
 * explicit to reserve layout space and avoid shift while the image loads.
 */
export function Logo({ variant = 'full', className = '' }: Props) {
  const height = HEIGHTS[variant];
  const width = Math.round((NATURAL_W / NATURAL_H) * height);
  return (
    <img
      src="/logo.png"
      alt="Tools Jamaica"
      width={width}
      height={height}
      style={{ height, width }}
      className={`shrink-0 object-contain ${className}`}
    />
  );
}
