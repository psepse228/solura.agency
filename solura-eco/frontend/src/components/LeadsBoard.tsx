// solura-eco/frontend/src/components/LeadsBoard.tsx
// Same board/drag-and-drop pattern as TaskBoard, simpler shape (no
// subtasks) -- a lead is new/contacted/qualified/converted/lost, and
// converting one just links it to a project (existing platform or one
// created for it), it doesn't auto-create anything on its own.
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  LeadEditDialog,
  STATUSES,
  STATUS_LABELS,
  type Lead,
  type Member,
  type Project,
} from "@/components/LeadEditDialog";

function LeadCard({
  lead,
  draggable,
  onDragStart,
  onEdit,
  onDelete,
}: {
  lead: Lead;
  draggable: boolean;
  onDragStart?: (e: DragEvent<HTMLDivElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className={`rounded-lg border border-border bg-bg2 px-3 py-2.5 ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start gap-2">
        <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium text-white hover:underline">{lead.name}</div>
          <div className="mt-0.5 text-[10.5px] text-silver-dim">
            {lead.company_name ?? "No company"} · {lead.members?.full_name ?? "Unassigned"}
          </div>
        </Link>
        <button onClick={onEdit} className="shrink-0 text-[10px] text-silver-dim hover:text-white" title="Edit lead">
          ✎
        </button>
        <button onClick={onDelete} className="shrink-0 text-[10px] text-silver-dim hover:text-red-400">
          ✕
        </button>
      </div>
    </div>
  );
}

export function LeadsBoard({ initialLeads }: { initialLeads: Lead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [members, setMembers] = useState<Member[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [editingForceStatus, setEditingForceStatus] = useState<Lead["status"] | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<Lead | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<Lead["status"] | null>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((res) => (res.ok ? res.json() : []))
      .then((m: Member[]) => setMembers(m))
      .catch(() => setMembers([]));
    fetch("/api/projects")
      .then((res) => (res.ok ? res.json() : []))
      .then((p: Project[]) => setProjects(p))
      .catch(() => setProjects([]));
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;

    setCreating(true);
    setError(null);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), company_name: companyName.trim() || null }),
    });
    setCreating(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create lead");
      return;
    }

    const created = (await res.json()) as Lead;
    setLeads([{ ...created, members: null }, ...leads]);
    setName("");
    setCompanyName("");
    router.refresh();
  }

  async function updateStatus(leadId: string, status: Lead["status"]) {
    // Dragging straight to "Converted" has no project to convert into --
    // the backend rejects that (a client needs a project_id), so send
    // people to the real dialog instead of silently failing.
    if (status === "converted") {
      const target = leads.find((l) => l.id === leadId);
      setEditing(target ?? null);
      setEditingForceStatus("converted");
      return;
    }

    const previous = leads;
    setLeads(leads.map((l) => (l.id === leadId ? { ...l, status } : l)));
    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setLeads(previous);
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't update status — try again.");
      return;
    }
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const res = await fetch(`/api/leads/${target.id}`, { method: "DELETE" });
    if (res.ok) {
      setLeads(leads.filter((l) => l.id !== target.id));
      router.refresh();
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, status: Lead["status"]) {
    e.preventDefault();
    setDragOverColumn(null);
    const leadId = e.dataTransfer.getData("text/plain");
    if (leadId) updateStatus(leadId, status);
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-2 rounded-2xl border border-border bg-bg2 p-4 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contact or company name"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Company</label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Optional"
            className="rounded-lg border border-border bg-transparent px-3 py-1.5 text-sm text-white placeholder:text-silver-dim"
          />
        </div>
        <button type="submit" disabled={!name.trim() || creating} className="btn-primary">
          {creating ? "Adding…" : "Add lead"}
        </button>
      </form>
      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {leads.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No leads yet — add the first one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STATUSES.map((status) => {
            const columnLeads = leads.filter((l) => l.status === status);
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
                  <div className="text-[10.5px] text-silver-dim">{columnLeads.length}</div>
                </div>
                <div className="flex flex-col gap-2">
                  {columnLeads.map((l) => (
                    <LeadCard
                      key={l.id}
                      lead={l}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", l.id)}
                      onEdit={() => {
                        setEditing(l);
                        setEditingForceStatus(undefined);
                      }}
                      onDelete={() => setPendingDelete(l)}
                    />
                  ))}
                  {columnLeads.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border py-4 text-center text-[11px] text-silver-dim">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <LeadEditDialog
          lead={editing}
          members={members}
          projects={projects}
          forceStatus={editingForceStatus}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setLeads(leads.map((l) => (l.id === updated.id ? updated : l)));
            setEditing(null);
            router.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this lead?"
        body={`"${pendingDelete?.name ?? ""}" will be permanently removed.`}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
