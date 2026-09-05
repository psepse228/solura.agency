// solura-eco/frontend/src/components/TaskBoard.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";

type Member = { id: string; full_name: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "normal" | "high";
  due_at: string | null;
  member_id: string | null;
  members: { full_name: string } | null;
};

const STATUS_LABELS: Record<Task["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const PRIORITY_DOT: Record<Task["priority"], string> = {
  high: "bg-red-400",
  normal: "bg-amber-400",
  low: "bg-white/30",
};

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function TaskBoard({ initialTasks }: { initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((res) => (res.ok ? res.json() : []))
      .then((m: Member[]) => setMembers(m))
      .catch(() => setMembers([]));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || creating) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        client_name: clientName.trim() || null,
        member_id: memberId || null,
        priority,
        due_at: dueAt || null,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create task");
      return;
    }

    const created = (await res.json()) as Task;
    const assignedMember = members.find((m) => m.id === memberId);
    setTasks([{ ...created, members: assignedMember ? { full_name: assignedMember.full_name } : null }, ...tasks]);
    setTitle("");
    setClientName("");
    setMemberId("");
    setPriority("normal");
    setDueAt("");
  }

  async function updateStatus(taskId: string, status: Task["status"]) {
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, status } : t)));
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setError("Couldn't update status — try again.");
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Delete this task?")) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks(tasks.filter((t) => t.id !== taskId));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-2xl border border-border bg-bg2 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Task</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <div className="flex min-w-[140px] flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Client</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <div className="flex min-w-[130px] flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Assign</label>
          <select
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-white"
          >
            <option value="" className="bg-bg2">
              Unassigned
            </option>
            {members.map((m) => (
              <option key={m.id} value={m.id} className="bg-bg2">
                {m.full_name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[110px] flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-white"
          >
            <option value="low" className="bg-bg2">
              Low
            </option>
            <option value="normal" className="bg-bg2">
              Normal
            </option>
            <option value="high" className="bg-bg2">
              High
            </option>
          </select>
        </div>
        <div className="flex min-w-[130px] flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Due</label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-white"
          />
        </div>
        <button
          type="submit"
          disabled={!title.trim() || creating}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {creating ? "Adding…" : "Add task"}
        </button>
      </form>
      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No tasks yet — add the first one above.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((t) => (
            <div
              key={t.id}
              className="animate-fade-in-up flex items-center gap-3 rounded-lg border border-border bg-bg2 px-4 py-3"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`${t.priority} priority`} />
              <div className="min-w-0 flex-1">
                <div className={`truncate text-[13.5px] font-medium ${t.status === "done" ? "text-silver-dim line-through" : "text-white"}`}>
                  {t.title}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-silver-dim">
                  {t.client_name ?? "No client"} · {t.members?.full_name ?? "Unassigned"}
                  {formatDue(t.due_at) && ` · due ${formatDue(t.due_at)}`}
                </div>
              </div>
              <select
                value={t.status}
                onChange={(e) => updateStatus(t.id, e.target.value as Task["status"])}
                className="shrink-0 rounded-lg border border-border bg-bg3 px-2 py-1 text-[11px] text-white"
              >
                {(Object.keys(STATUS_LABELS) as Task["status"][]).map((s) => (
                  <option key={s} value={s} className="bg-bg2">
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => deleteTask(t.id)}
                className="shrink-0 text-[11px] text-silver-dim hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
