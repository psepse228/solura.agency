// solura-eco/frontend/src/components/LeadEditDialog.tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

export type Member = { id: string; full_name: string };
export type Project = { id: string; name: string };
export type Lead = {
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
type LeadDetail = Lead & { notes: string | null; converted_project_id: string | null };

export const STATUSES: Lead["status"][] = ["new", "contacted", "qualified", "converted", "lost"];
export const STATUS_LABELS: Record<Lead["status"], string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

export function LeadEditDialog({
  lead,
  members,
  projects,
  forceStatus,
  onClose,
  onSaved,
}: {
  lead: Lead;
  members: Member[];
  projects: Project[];
  /** Pre-select this status on open (e.g. dragged straight to Converted) --
      distinct from lead.status, which reflects what's actually saved. */
  forceStatus?: Lead["status"];
  onClose: () => void;
  onSaved: (updated: Lead) => void;
}) {
  const [name, setName] = useState(lead.name);
  const [companyName, setCompanyName] = useState(lead.company_name ?? "");
  const [contactEmail, setContactEmail] = useState(lead.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(lead.contact_phone ?? "");
  const [memberId, setMemberId] = useState(lead.member_id ?? "");
  const [status, setStatus] = useState(forceStatus ?? lead.status);
  const [convertedProjectId, setConvertedProjectId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The board/list only ever hands this dialog the lightweight row shape
  // (no notes, no converted_project_id) -- fetch the real detail once on
  // open so an existing lead's notes/conversion state actually shows up,
  // instead of always looking blank and risking an accidental overwrite.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/leads/${lead.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((detail: LeadDetail | null) => {
        if (cancelled || !detail) return;
        setNotes(detail.notes ?? "");
        setConvertedProjectId(detail.converted_project_id ?? "");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [lead.id]);

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
                <option key={s} value={s} className="bg-bg2">
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="field-label">Owner</span>
            <select className="field" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="" className="bg-bg2">
                Unassigned
              </option>
              {members.map((m) => (
                <option key={m.id} value={m.id} className="bg-bg2">
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
              <option value="" className="bg-bg2">
                — pick a project —
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-bg2">
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          <span className="field-label">Notes</span>
          <textarea
            className="field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={loaded ? "" : "Loading…"}
          />
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
