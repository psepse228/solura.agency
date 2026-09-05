// solura-eco/frontend/src/components/TaskBoard.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";

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

const STATUSES: Task["status"][] = ["todo", "in_progress", "blocked", "done"];
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

// Two field-width tiers instead of five distinct arbitrary values -- one
// for the free-text task title, one shared by every other field.
const FIELD_WIDE = "min-w-[220px] flex-1";
const FIELD_NARROW = "min-w-[130px]";

function formatDue(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function TaskCard({
  task,
  draggable,
  onDragStart,
  onDelete,
}: {
  task: Task;
  draggable: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`rounded-lg border border-border bg-bg2 px-3 py-2.5 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} title={`${task.priority} priority`} />
        <div className="min-w-0 flex-1">
          <div className={`text-[13px] font-medium ${task.status === "done" ? "text-silver-dim line-through" : "text-white"}`}>
            {task.title}
          </div>
          <div className="mt-0.5 text-[10.5px] text-silver-dim">
            {task.client_name ?? "No client"} · {task.members?.full_name ?? "Unassigned"}
            {formatDue(task.due_at) && ` · due ${formatDue(task.due_at)}`}
          </div>
        </div>
        <button onClick={onDelete} className="shrink-0 text-[10px] text-silver-dim hover:text-red-400">
          ✕
        </button>
      </div>
    </div>
  );
}

export function TaskBoard({ initialTasks }: { initialTasks: Task[] }) {
  const router = useRouter();
  const [view, setView] = useState<"board" | "list">("board");
  const [tasks, setTasks] = useState(initialTasks);
  const [members, setMembers] = useState<Member[]>([]);
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [memberId, setMemberId] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Task["status"] | null>(null);

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
    router.refresh();
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
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const res = await fetch(`/api/tasks/${target.id}`, { method: "DELETE" });
    if (res.ok) {
      setTasks(tasks.filter((t) => t.id !== target.id));
      router.refresh();
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: Task["status"]) {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = e.dataTransfer.getData("text/plain");
    if (taskId) updateStatus(taskId, status);
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-2xl border border-border bg-bg2 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className={`flex ${FIELD_WIDE} flex-col gap-1`}>
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Task</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing?"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <div className={`flex ${FIELD_NARROW} flex-col gap-1`}>
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Client</label>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <div className={`flex ${FIELD_NARROW} flex-col gap-1`}>
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
        <div className={`flex ${FIELD_NARROW} flex-col gap-1`}>
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
        <div className={`flex ${FIELD_NARROW} flex-col gap-1`}>
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Due</label>
          <input
            type="date"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-white"
          />
        </div>
        <button type="submit" disabled={!title.trim() || creating} className="btn-primary">
          {creating ? "Adding…" : "Add task"}
        </button>
      </form>
      {error && <p className="text-[11px] text-red-400">{error}</p>}

      <div className="flex gap-1 self-start rounded-lg border border-border p-0.5">
        {(["board", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
              view === v ? "bg-bg3 text-white" : "text-silver-dim hover:text-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {tasks.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No tasks yet — add the first one above.</p>
        </div>
      ) : view === "board" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STATUSES.map((status) => {
            const columnTasks = tasks.filter((t) => t.status === status);
            return (
              <div
                key={status}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverColumn(status);
                }}
                onDragLeave={() => setDragOverColumn(null)}
                onDrop={(e) => handleDrop(e, status)}
                className={`flex flex-col gap-2 rounded-2xl border p-2.5 transition-colors ${
                  dragOverColumn === status ? "border-cyan/50 bg-cyan/5" : "border-border bg-bg2/40"
                }`}
              >
                <div className="flex items-center justify-between px-1 pt-0.5">
                  <div className="text-[10.5px] font-bold uppercase tracking-wide text-silver-dim">
                    {STATUS_LABELS[status]}
                  </div>
                  <div className="text-[10.5px] text-silver-dim">{columnTasks.length}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {columnTasks.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                      onDelete={() => setPendingDelete(t)}
                    />
                  ))}
                  {columnTasks.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border py-4 text-center text-[11px] text-silver-dim">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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
                {STATUSES.map((s) => (
                  <option key={s} value={s} className="bg-bg2">
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setPendingDelete(t)}
                className="shrink-0 text-[11px] text-silver-dim hover:text-red-400"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this task?"
        body={`"${pendingDelete?.title ?? ""}" will be permanently removed.`}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
