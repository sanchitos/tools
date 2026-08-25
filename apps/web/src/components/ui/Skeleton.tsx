/** Pulse placeholder for loading grids. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-strong ${className}`} aria-hidden="true" />;
}
