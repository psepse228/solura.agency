"use client";

import { useEffect, useState } from "react";

type Member = { id: string; full_name: string; username: string };

type Props = {
  projectId: string;
  initialDevMembers: { id: string; full_name: string }[];
  initialClientWorkMembers: { id: string; full_name: string }[];
};

function RoleCheckboxGroup({
  title,
  allMembers,
  selectedIds,
  onToggle,
  disabled,
}: {
  title: string;
  allMembers: Member[];
  selectedIds: Set<string>;
  onToggle: (memberId: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-[11px] font-semibold text-silver-dim">{title}</div>
      {allMembers.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No members loaded.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {allMembers.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                checked={selectedIds.has(m.id)}
                onChange={() => onToggle(m.id)}
                disabled={disabled}
                className="h-3.5 w-3.5 rounded border-border accent-cyan"
              />
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg3 text-[10px] font-bold">
                {m.full_name.slice(0, 1).toUpperCase()}
              </span>
              {m.full_name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function RolesEditor({ projectId, initialDevMembers, initialClientWorkMembers }: Props) {
  const [allMembers, setAllMembers] = useState<Member[]>([]);
  const [devIds, setDevIds] = useState(new Set(initialDevMembers.map((m) => m.id)));
  const [clientWorkIds, setClientWorkIds] = useState(new Set(initialClientWorkMembers.map((m) => m.id)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/members")
      .then((res) => (res.ok ? res.json() : []))
      .then((members: Member[]) => setAllMembers(members))
      .catch(() => setAllMembers([]));
  }, []);

  async function saveRoles(nextDevIds: Set<string>, nextClientWorkIds: Set<string>) {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/roles`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dev_member_ids: Array.from(nextDevIds),
        client_work_member_ids: Array.from(nextClientWorkIds),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save — try again.");
    }
  }

  function toggleDev(memberId: string) {
    const next = new Set(devIds);
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    setDevIds(next);
    saveRoles(next, clientWorkIds);
  }

  function toggleClientWork(memberId: string) {
    const next = new Set(clientWorkIds);
    if (next.has(memberId)) next.delete(memberId);
    else next.add(memberId);
    setClientWorkIds(next);
    saveRoles(devIds, next);
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide text-silver-dim">Roles</div>
        {saving && <span className="text-[10px] text-silver-dim">Saving…</span>}
      </div>
      <RoleCheckboxGroup
        title="Development"
        allMembers={allMembers}
        selectedIds={devIds}
        onToggle={toggleDev}
        disabled={saving}
      />
      <RoleCheckboxGroup
        title="Client work"
        allMembers={allMembers}
        selectedIds={clientWorkIds}
        onToggle={toggleClientWork}
        disabled={saving}
      />
      {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}
