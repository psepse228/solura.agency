export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-8 py-8">
      <div className="h-7 w-64 animate-pulse rounded bg-bg3" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-bg2" />
      <div className="mt-6 mb-3 h-3 w-28 animate-pulse rounded bg-bg3" />
      <div className="overflow-hidden rounded-2xl border border-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[54px] animate-pulse border-b border-white/5 bg-bg2 last:border-0" />
        ))}
      </div>
    </div>
  );
}
