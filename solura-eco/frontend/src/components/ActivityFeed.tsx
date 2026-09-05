// solura-eco/frontend/src/components/ActivityFeed.tsx
// A single merged, chronological feed (commits/deploys, new tasks,
// clients, documents) -- replaces a grid of static stat tiles, which
// looks empty with today's real data volume. A dense list looks complete
// with 1 item or 100 (Linear/Notion's approach to this exact problem).
type ActivityItem = {
  type: "dev_event" | "task" | "client" | "document";
  id: string;
  label: string;
  sub: string;
  href: string | null;
  at: string;
};

const TYPE_DOT: Record<ActivityItem["type"], string> = {
  dev_event: "bg-cyan",
  task: "bg-amber-400",
  client: "bg-violet",
  document: "bg-white/40",
};

function formatWhen(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <div className="panel text-center">
        <p className="text-sm text-silver">Nothing's happened yet — activity shows up here as it comes in.</p>
      </div>
    );
  }

  return (
    <div className="panel !p-0">
      {items.map((item, i) => {
        const row = (
          <div className="flex items-start gap-3 px-4 py-3">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TYPE_DOT[item.type]}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-white">{item.label}</div>
              <div className="mt-0.5 text-[11px] text-silver-dim">
                {item.sub} · {formatWhen(item.at)}
              </div>
            </div>
          </div>
        );
        const border = i === items.length - 1 ? "" : "border-b border-white/5";
        return item.href ? (
          <a key={item.id} href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} className={`row-hover block ${border}`}>
            {row}
          </a>
        ) : (
          <div key={item.id} className={border}>
            {row}
          </div>
        );
      })}
    </div>
  );
}
