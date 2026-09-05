// solura-eco/frontend/src/app/(app)/loading.tsx
export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="h-7 w-40 animate-pulse rounded bg-bg3" />
      <div className="mt-2 h-4 w-80 max-w-full animate-pulse rounded bg-bg2" />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-bg2 p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-bg3" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-bg3" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-3 rounded-2xl border border-border bg-bg2 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-bg3" />
                <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-bg3" />
              </div>
              <div className="h-4 w-14 shrink-0 animate-pulse rounded-full bg-bg3" />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 animate-pulse rounded-full bg-bg3" />
              <div className="h-3 w-8 shrink-0 animate-pulse rounded bg-bg3" />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex">
                {Array.from({ length: 3 }).map((__, j) => (
                  <div
                    key={j}
                    className="-ml-1.5 h-5 w-5 animate-pulse rounded-full bg-bg3 first:ml-0"
                  />
                ))}
              </div>
              <div className="h-3 w-14 animate-pulse rounded bg-bg3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
