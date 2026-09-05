// solura-eco/frontend/src/components/ClientEditPanel.tsx
// Client name/status/contact details used to be seed-script-only, same
// gap as projects -- this is the edit form for the client detail page.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

const STATUSES = ["active", "paused", "churned"] as const;

type Props = {
  clientId: string;
  initial: {
    name: string;
    status: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
  };
};

export function ClientEditPanel({ clientId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [contactName, setContactName] = useState(initial.contact_name ?? "");
  const [contactEmail, setContactEmail] = useState(initial.contact_email ?? "");
  const [contactPhone, setContactPhone] = useState(initial.contact_phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        status,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
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
      <button onClick={() => setOpen(true)} className="btn-secondary shrink-0">
        Edit
      </button>

      <Modal open={open} title="Edit client" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Company name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label>
            <span className="field-label">Status</span>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Contact name</span>
            <input className="field" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </label>

          <label>
            <span className="field-label">Contact email</span>
            <input
              type="email"
              className="field"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
            />
          </label>

          <label>
            <span className="field-label">Contact phone</span>
            <input className="field" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </label>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
