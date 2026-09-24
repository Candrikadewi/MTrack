/** Pulsing placeholder block — the loading half of a "loading vs. genuinely
 * empty" pair. Never render this and an empty state for the same data at
 * once; a store's `ready()` flag (see `useStoreReady`) decides which one. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200 dark:bg-slate-800 ${className}`} />;
}

/** Approximates a `Card`'s shape (title bar + a couple of content blocks) so
 * the loading page doesn't visibly jump when real cards mount in its place. */
export function CardSkeleton({ lines = 2 }: { lines?: number }) {
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
