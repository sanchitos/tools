/** Spinner loader (never plain "Loading…" text, per the UI conventions). */
export function Loader({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center py-16 ${className}`}>
      <span
        className="inline-block h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary"
        aria-hidden="true"
      />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
