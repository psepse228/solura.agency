// solura-eco/frontend/src/app/(app)/clients/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type Client = {
  id: string;
  name: string;
  status: string;
  projects: { id: string }[];
};

async function getClients(token: string | undefined): Promise<Client[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/clients`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Client[];
}

export default async function ClientsPage() {
  const token = (await cookies()).get("session")?.value;
  const clients = await getClients(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Clients</h1>
      <p className="mb-5 text-sm text-silver">Every client Solura works with.</p>

      {clients.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No clients yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Link
              key={c.id}
              href={`/clients/${c.id}`}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-display text-base font-bold text-white">{c.name}</div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                    c.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                  }`}
                >
                  {c.status}
                </span>
              </div>
              <div className="text-xs text-silver-dim">
                {c.projects.length} {c.projects.length === 1 ? "project" : "projects"}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
