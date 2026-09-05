/** CIRCLE's mark: an open ring (the name, literally, and the recurring
 * cycle the product tracks — contract-stage progression, Vokasi batches,
 * takt-time changes, headcount replacement — all the same "one thing
 * completes, another begins" shape) on a solid graphite ground. Replaces a
 * lucide Sparkles-on-blue/indigo/violet-gradient badge that read as generic
 * AI-SaaS iconography with no connection to a plant HR/shop-floor product. */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-900 dark:bg-slate-800 ${className}`}>
      <svg viewBox="0 0 24 24" fill="none" className="h-[58%] w-[58%]" aria-hidden="true">
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="#f0a93b"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="40.5 9.8"
          transform="rotate(45 12 12)"
        />
      </svg>
    </div>
  );
}
