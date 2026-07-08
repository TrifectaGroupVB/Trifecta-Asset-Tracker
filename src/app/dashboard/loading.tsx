// Skeleton for the queue while requests load — shapes only, no spinners.
export default function DashboardLoading() {
  return (
    <main className="p-4 pb-16" aria-busy="true" aria-label="Loading queue">
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-sm border border-border bg-surface" />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-10 w-20 animate-pulse rounded-sm border border-border bg-surface" />
        ))}
      </div>
      <div className="mt-3 h-12 animate-pulse rounded-sm border border-border bg-surface" />
      <ul className="mt-4 flex flex-col divide-y divide-border border-y border-border">
        {Array.from({ length: 4 }, (_, i) => (
          <li key={i} className="flex gap-3 py-3">
            <div className="size-14 animate-pulse rounded-sm bg-surface" />
            <div className="flex-1">
              <div className="h-4 w-2/3 animate-pulse rounded-sm bg-surface" />
              <div className="mt-2 h-3 w-full animate-pulse rounded-sm bg-surface" />
              <div className="mt-2 h-5 w-1/2 animate-pulse rounded-sm bg-surface" />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
