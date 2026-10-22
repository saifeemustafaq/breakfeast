export function PageSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-2/3 rounded-lg bg-muted" />
      <div className="h-4 w-1/2 rounded bg-muted" />
      <div className="mt-4 h-24 rounded-2xl bg-muted" />
      <div className="h-24 rounded-2xl bg-muted" />
    </div>
  );
}
