export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="h-7 w-64 animate-pulse rounded bg-bg3" />
      <div className="mt-2 h-4 w-48 animate-pulse rounded bg-bg2" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-2xl border border-border bg-bg2" />
        ))}
      </div>
    </div>
  );
}
