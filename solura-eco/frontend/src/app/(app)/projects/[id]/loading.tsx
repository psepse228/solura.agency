// solura-eco/frontend/src/app/(app)/projects/[id]/loading.tsx
export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-5 h-4 w-24 animate-pulse rounded bg-bg2" />

      <div className="mb-6 flex items-start gap-3.5">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-bg3" />
        <div>
          <div className="h-6 w-48 animate-pulse rounded bg-bg3" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-bg2" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-4 h-3 w-16 animate-pulse rounded bg-bg3" />
            <div className="flex items-center gap-3.5">
              <div className="h-2 flex-1 animate-pulse rounded-full bg-bg3" />
              <div className="h-5 w-10 animate-pulse rounded bg-bg3" />
            </div>
            <div className="mt-3.5 flex gap-6 border-t border-white/5 pt-3.5">
              <div>
                <div className="h-2.5 w-12 animate-pulse rounded bg-bg3" />
                <div className="mt-1.5 h-4 w-16 animate-pulse rounded bg-bg3" />
              </div>
              <div>
                <div className="h-2.5 w-20 animate-pulse rounded bg-bg3" />
                <div className="mt-1.5 h-4 w-8 animate-pulse rounded bg-bg3" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 h-3 w-16 animate-pulse rounded bg-bg3" />
            <div className="flex flex-col">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 border-b border-white/5 py-2 last:border-0">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-bg3" />
                  <div className="min-w-0 flex-1">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-bg3" />
                    <div className="mt-1.5 h-3 w-1/3 animate-pulse rounded bg-bg3" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 h-3 w-14 animate-pulse rounded bg-bg3" />
            <div className="flex flex-col gap-2">
              <div className="h-8 w-full animate-pulse rounded-lg bg-bg3" />
              <div className="h-8 w-full animate-pulse rounded-lg bg-bg3" />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 h-3 w-12 animate-pulse rounded bg-bg3" />
            <div className="h-3 w-full animate-pulse rounded bg-bg3" />
            <div className="mt-1.5 h-3 w-5/6 animate-pulse rounded bg-bg3" />
            <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-bg3" />
          </div>

          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 h-3 w-20 animate-pulse rounded bg-bg3" />
            <div className="h-20 w-full animate-pulse rounded-lg bg-bg3" />
          </div>
        </div>
      </div>
    </div>
  );
}
