// solura-eco/frontend/src/app/(app)/uni-load/loading.tsx
export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-5 h-6 w-32 animate-pulse rounded bg-bg3" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[60px] animate-pulse rounded-lg border border-border bg-bg2" />
        ))}
      </div>
    </div>
  );
}
