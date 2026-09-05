// solura-eco/frontend/src/app/(app)/clients/loading.tsx
export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-1 h-7 w-32 animate-pulse rounded bg-bg3" />
      <div className="mb-5 h-4 w-64 animate-pulse rounded bg-bg2" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-2xl border border-border bg-bg2" />
        ))}
      </div>
    </div>
  );
}
