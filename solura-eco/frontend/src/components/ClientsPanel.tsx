// solura-eco/frontend/src/components/ClientsPanel.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusPill } from "@/components/StatusPill";

type Client = { id: string; name: string; status: string };

export function ClientsPanel({ projectId, initialClients }: { projectId: string; initialClients: Client[] }) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Client | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || adding) return;

    setAdding(true);
    setError(null);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, name: name.trim() }),
    });
    setAdding(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't add client");
      return;
    }

    const created = (await res.json()) as Client;
    setClients([...clients, created]);
    setName("");
    router.refresh();
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const res = await fetch(`/api/clients/${target.id}`, { method: "DELETE" });
    if (res.ok) {
      setClients(clients.filter((c) => c.id !== target.id));
      router.refresh();
    }
  }

  return (
    <div className="panel">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Clients</div>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="flex-1 rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-silver-dim"
        />
        <button type="submit" disabled={!name.trim() || adding} className="btn-primary shrink-0">
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="mb-3 text-[11px] text-red-400">{error}</p>}

      {clients.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No clients subscribed yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <div key={c.id} className="row-hover flex items-center justify-between gap-2 rounded-lg bg-bg3 px-3 py-2">
              <Link href={`/clients/${c.id}`} className="min-w-0 flex-1 truncate text-xs font-medium text-white">
                {c.name}
              </Link>
              <StatusPill status={c.status} size="xs" />
              <button
                onClick={() => setPendingDelete(c)}
                className="shrink-0 text-[10px] text-silver-dim hover:text-red-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Remove this client?"
        body={`${pendingDelete?.name ?? ""} and all of its notes will be permanently removed.`}
        confirmLabel="Remove"
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
