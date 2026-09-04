// solura-eco/frontend/src/components/AssignmentList.tsx
type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};

function statusPill(status: string, overdue: boolean) {
  if (overdue) {
    return "bg-red-500/15 text-red-400";
  }
  if (status === "graded" || status === "submitted") {
    return "bg-cyan/15 text-cyan";
  }
  return "bg-white/10 text-silver";
}

function formatDue(iso: string | null): string {
  if (!iso) return "No due date";
  const date = new Date(iso);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AssignmentList({ assignments }: { assignments: Assignment[] }) {
  if (assignments.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
        <p className="text-sm text-silver">No assignments synced yet — check back after the next sync.</p>
      </div>
    );
  }

  const now = Date.now();

  return (
    <div className="flex flex-col gap-2">
      {assignments.map((a) => {
        const overdue = a.status === "no submission yet" && !!a.due_at && new Date(a.due_at).getTime() < now;
        return (
          <div
            key={a.id}
            className="animate-fade-in-up flex items-center justify-between gap-3 rounded-lg border border-border bg-bg2 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-white">
                {a.html_url ? (
                  <a href={a.html_url} target="_blank" className="hover:underline">
                    {a.name}
                  </a>
                ) : (
                  a.name
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-silver-dim">
                {a.course_name ?? "—"} · {formatDue(a.due_at)}
              </div>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusPill(a.status, overdue)}`}>
              {overdue ? "overdue" : a.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}
