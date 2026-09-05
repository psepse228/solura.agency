// solura-eco/frontend/src/components/LeadsBoard.tsx
// Same board/drag-and-drop pattern as TaskBoard, simpler shape (no
// subtasks) -- a lead is new/contacted/qualified/converted/lost, and
// converting one just links it to a project (existing platform or one
// created for it), it doesn't auto-create anything on its own.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type DragEvent, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";

type Member = { id: string; full_name: string };
type Project = { id: string; name: string };
type Lead = {
  id: string;
  name: string;
  company_name: string | null;
  status: "new" | "contacted" | "qualified" | "converted" | "lost";
  source: string;
  contact_email: string | null;
  contact_phone: string | null;
  member_id: string | null;
  members: { full_name: string } | null;
};

const STATUSES: Lead["status"][] = ["new", "contacted", "qualified", "converted", "lost"];
const STATUS_LABELS: Record<Lead["status"], string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

function LeadEditDialog({
  lead,
  members,
  projects,
  onClose,
  onSaved,
}: {
  lead: Lead;
  members: Member[];
  projects: Project[];
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}) {
  const [name, setName] = useState(lead.name);
  const [companyName, setCompanyName] = useState(lead.company_name ?? "");
  const [contactEmail, setContactEmail] = useState(lead.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(lead.contact_phone ?? "");
  const [memberId, setMemberId] = useState(lead.member_id ?? "");
  const [status, setStatus] = useState(lead.status);
  const [convertedProjectId, setConvertedProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsProjectToConvert = status === "converted" && !convertedProjectId;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving || needsProjectToConvert) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        company_name: companyName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        member_id: memberId || null,
        status,
        notes: notes.trim() || null,
        ...(status === "converted" && convertedProjectId ? { converted_project_id: convertedProjectId } : {}),
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save");
      return;
    }

    const updated = (await res.json()) as Lead;
    const assignedMember = members.find((m) => m.id === memberId);
    onSaved({ ...updated, members: assignedMember ? { full_name: assignedMember.full_name } : null });
  }

  return (
    <Modal open title="Edit lead" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label>
          <span className="field-label">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>

        <label>
          <span className="field-label">Company</span>
          <input className="field" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">Email</span>
            <input type="email" className="field" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </label>
          <label>
            <span className="field-label">Phone</span>
            <input className="field" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="field-label">Status</span>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as Lead["status"])}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Owner</span>
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

        {status === "converted" && (
          <label>
            <span className="field-label">
              Converted into project — creates the real client on save
            </span>
            <select className="field" value={convertedProjectId} onChange={(e) => setConvertedProjectId(e.target.value)}>
              <option value="">— pick a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className="field-label">Notes</span>
          <textarea className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <div className="mt-1 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={!name.trim() || saving || needsProjectToConvert} className="btn-primary">
            {saving ? "Saving…" : needsProjectToConvert ? "Pick a project first" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-white">{lead.name}</div>
          <div className="mt-0.5 text-[10.5px] text-silver-dim">
            {lead.company_name ?? "No company"} · {lead.members?.full_name ?? "Unassigned"}
          </div>
        </div>
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
      setEditing(target ? { ...target, status: "converted" } : null);
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
                      onEdit={() => setEditing(l)}
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
