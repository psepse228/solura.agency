// solura-eco/frontend/src/components/TaskEditPanel.tsx
// Everything about a major task except its status/subtasks was frozen
// at creation -- title, description, client, assignee, priority, due
// date all lacked any edit path. This is that path.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

type Member = { id: string; full_name: string };
type Task = {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  priority: "low" | "normal" | "high";
  due_at: string | null;
  member_id: string | null;
};

export function TaskEditPanel({ task, members }: { task: Task; members: Member[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [clientName, setClientName] = useState(task.client_name ?? "");
  const [memberId, setMemberId] = useState(task.member_id ?? "");
  const [priority, setPriority] = useState(task.priority);
  const [dueAt, setDueAt] = useState(task.due_at ? task.due_at.slice(0, 10) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        client_name: clientName.trim() || null,
        member_id: memberId || null,
        priority,
        due_at: dueAt || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="shrink-0 text-[10px] text-silver-dim hover:text-white"
        title="Edit task"
      >
        ✎
      </button>

      <Modal open={open} title="Edit task" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Title</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <label>
            <span className="field-label">Description</span>
            <textarea
              className="field"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Client</span>
              <input className="field" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </label>
            <label>
              <span className="field-label">Assign</span>
              <select className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Priority</span>
              <select
                className="field"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task["priority"])}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>
              <span className="field-label">Due</span>
              <input type="date" className="field" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
            </label>
          </div>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
