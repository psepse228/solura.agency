// solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { NotesPanel } from "@/components/NotesPanel";

type Note = { id: string; body: string; author: string; created_at: string };
type ClientDetail = {
  id: string;
  name: string;
  status: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  project_id: string;
  project_name: string | null;
};

async function getClient(id: string, token: string | undefined): Promise<ClientDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/clients/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as ClientDetail;
}

async function getClientNotes(id: string, token: string | undefined): Promise<Note[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/clients/${id}/notes`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Note[];
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const [client, notes] = await Promise.all([getClient(id, token), getClientNotes(id, token)]);

  if (!client) notFound();

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <Link href="/clients" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All clients
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{client.name}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
            client.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
          }`}
        >
          {client.status}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <Link
            href={`/projects/${client.project_id}`}
            className="flex flex-col gap-1 rounded-2xl border border-border bg-bg2 p-4 transition-colors hover:border-white/15"
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">
              Subscribed to
            </div>
            <div className="font-display text-base font-bold text-white">{client.project_name ?? "—"} ↗</div>
          </Link>

          {(client.contact_name || client.contact_email || client.contact_phone) && (
            <div className="rounded-2xl border border-border bg-bg2 p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Contact</div>
              <div className="flex flex-col gap-1 text-[12.5px] text-silver">
                {client.contact_name && <div>{client.contact_name}</div>}
                {client.contact_email && <div>{client.contact_email}</div>}
                {client.contact_phone && <div>{client.contact_phone}</div>}
              </div>
            </div>
          )}
        </div>

        <NotesPanel apiPath={`/api/clients/${client.id}/notes`} initialNotes={notes ?? []} />
      </div>
    </div>
  );
}
