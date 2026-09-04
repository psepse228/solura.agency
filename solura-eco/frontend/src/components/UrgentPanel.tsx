// solura-eco/frontend/src/components/UrgentPanel.tsx
type CanvasDeadline = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string;
  html_url: string | null;
  overdue: boolean;
};
type StaleProject = {
  id: string;
  name: string;
  days_since_activity: number | null;
};
type ClientMessage = {
  id: string;
  client_id: string;
  client_name: string | null;
  last_message_at: string;
};
export type UrgentData = {
  canvas_deadlines: CanvasDeadline[];
  stale_projects: StaleProject[];
  client_messages: ClientMessage[];
};

type Row = {
  key: string;
  label: string;
  sub: string;
  href: string;
  external: boolean;
  dot: string; // tailwind bg-* class
  sortAt: number; // epoch ms, most-urgent-first
};

function formatRelativeDue(iso: string, overdue: boolean): string {
  const diffMs = Math.abs(new Date(iso).getTime() - Date.now());
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const unit = hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
  return overdue ? `${unit} overdue` : `due in ${unit}`;
}

function formatRelativePast(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60));
  return hours < 1 ? "just now" : hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function UrgentPanel({ data }: { data: UrgentData }) {
  const rows: Row[] = [];

  for (const a of data.canvas_deadlines) {
    rows.push({
      key: `canvas-${a.id}`,
      label: a.name,
      sub: `${a.course_name ?? "Canvas"} · ${formatRelativeDue(a.due_at, a.overdue)}`,
      href: a.html_url ?? "/uni-load",
      external: !!a.html_url,
      dot: a.overdue ? "bg-red-400" : "bg-amber-400",
      sortAt: a.overdue ? -Infinity : new Date(a.due_at).getTime(),
    });
  }

  for (const p of data.stale_projects) {
    const days = p.days_since_activity;
    rows.push({
      key: `project-${p.id}`,
      label: p.name,
      sub: days === null ? "no activity yet" : `${days}d quiet`,
      href: `/projects/${p.id}`,
      external: false,
      dot: days === null || days >= 14 ? "bg-red-400" : "bg-amber-400",
      sortAt: -(days ?? 999999),
    });
  }

  for (const m of data.client_messages) {
    rows.push({
      key: `client-${m.id}`,
      label: m.client_name ?? "Unknown client",
      sub: `new message · ${formatRelativePast(m.last_message_at)}`,
      href: `/clients/${m.client_id}`,
      external: false,
      dot: "bg-amber-400",
      sortAt: new Date(m.last_message_at).getTime(),
    });
  }

  if (rows.length === 0) return null;

  rows.sort((a, b) => a.sortAt - b.sortAt);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="px-2.5 text-[10.5px] font-bold uppercase tracking-wide text-silver-dim">Urgent</div>
      {rows.map((r) => (
        <a
          key={r.key}
          href={r.href}
          target={r.external ? "_blank" : undefined}
          className="flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] hover:bg-bg3"
        >
          <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${r.dot}`} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-white">{r.label}</span>
            <span className="block truncate text-[10.5px] text-silver-dim">{r.sub}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
