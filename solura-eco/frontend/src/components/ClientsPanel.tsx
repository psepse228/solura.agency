// solura-eco/frontend/src/components/ClientsPanel.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Client = { id: string; name: string; status: string };

export function ClientsPanel({ projectId, initialClients }: { projectId: string; initialClients: Client[] }) {
  const [clients, setClients] = useState(initialClients);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Clients</div>

      <form onSubmit={handleAdd} className="mb-4 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="flex-1 rounded-lg border border-border bg-transparent px-3 py-1.5 text-xs text-white placeholder:text-silver-dim"
        />
        <button
          type="submit"
          disabled={!name.trim() || adding}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {adding ? "Adding…" : "Add"}
        </button>
      </form>
      {error && <p className="mb-3 text-[11px] text-red-400">{error}</p>}

      {clients.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No clients subscribed yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex items-center justify-between gap-2 rounded-lg bg-bg3 px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.06]"
            >
              {c.name}
              <span
                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold capitalize ${
                  c.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                }`}
              >
                {c.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
