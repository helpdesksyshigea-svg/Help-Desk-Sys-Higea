export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-[4px] bg-[var(--color-ink)]/[0.08] ${className}`} />;
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Skeleton className="h-3 w-3 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-6 w-28" />
    </div>
  );
}
