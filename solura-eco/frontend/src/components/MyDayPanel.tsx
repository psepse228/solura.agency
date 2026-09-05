// solura-eco/frontend/src/components/MyDayPanel.tsx
// The personal landing panel -- what the signed-in member should
// actually be doing today, not the whole team's feed. Backed by
// GET /me/day (this member's own open tasks + Canvas deadlines).
import Link from "next/link";

type MyTask = {
  id: string;
  title: string;
  status: string;
  priority: "low" | "normal" | "high";
  due_at: string | null;
  client_name: string | null;
  subtasks_done: number;
  subtasks_total: number;
};
type CanvasDeadline = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string;
  html_url: string | null;
  overdue: boolean;
};

const PRIORITY_DOT: Record<MyTask["priority"], string> = {
  high: "bg-red-400",
  normal: "bg-amber-400",
  low: "bg-white/30",
};

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MyDayPanel({ tasks, canvasDeadlines }: { tasks: MyTask[]; canvasDeadlines: CanvasDeadline[] }) {
  if (tasks.length === 0 && canvasDeadlines.length === 0) {
    return (
      <div className="panel">
        <div className="mb-1 text-xs font-bold uppercase tracking-wide text-silver-dim">My day</div>
        <p className="text-sm text-silver">Nothing assigned to you and no deadlines coming up. Clear runway.</p>
      </div>
    );
  }

  return (
    <div className="panel !p-0">
      <div className="px-4 pt-3.5 text-xs font-bold uppercase tracking-wide text-silver-dim">My day</div>
      <div className="flex flex-col divide-y divide-white/5">
        {tasks.map((t) => (
          <Link
            key={t.id}
            href="/tasks"
            className="row-hover flex items-center gap-2.5 px-4 py-2.5 text-[13px]"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} />
            <span className="min-w-0 flex-1 truncate text-white">{t.title}</span>
            {t.subtasks_total > 0 && (
              <span className="shrink-0 text-[10.5px] text-silver-dim">
                {t.subtasks_done}/{t.subtasks_total}
              </span>
            )}
            <span className="shrink-0 text-[10.5px] text-silver-dim">{t.client_name ?? "No client"}</span>
            {formatDue(t.due_at) && (
              <span className="shrink-0 text-[10.5px] text-silver-dim">due {formatDue(t.due_at)}</span>
            )}
          </Link>
        ))}
        {canvasDeadlines.map((a) => (
          <a
            key={a.id}
            href={a.html_url ?? "#"}
            target="_blank"
            className="row-hover flex items-center gap-2.5 px-4 py-2.5 text-[13px]"
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.overdue ? "bg-red-400" : "bg-cyan"}`} />
            <span className="min-w-0 flex-1 truncate text-white">{a.name}</span>
            <span className="shrink-0 text-[10.5px] text-silver-dim">{a.course_name ?? "Uni"}</span>
            <span className={`shrink-0 text-[10.5px] ${a.overdue ? "text-red-400" : "text-silver-dim"}`}>
              {a.overdue ? "overdue" : `due ${formatDue(a.due_at)}`}
            </span>
          </a>
        ))}
      </div>
      <div className="h-2" />
    </div>
  );
}
