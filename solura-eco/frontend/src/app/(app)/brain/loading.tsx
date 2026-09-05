export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="mb-1 h-7 w-52 animate-pulse rounded bg-bg3" />
      <div className="mb-5 h-4 w-80 max-w-full animate-pulse rounded bg-bg2" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[64px] animate-pulse rounded-lg border border-border bg-bg2" />
        ))}
      </div>
    </div>
  );
}
