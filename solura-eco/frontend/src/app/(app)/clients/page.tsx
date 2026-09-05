// solura-eco/frontend/src/app/(app)/clients/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type Client = {
  id: string;
  name: string;
  status: string;
  project_id: string;
  project_name: string | null;
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

function groupByProject(clients: Client[]): Map<string, { projectId: string; projectName: string; clients: Client[] }> {
  const groups = new Map<string, { projectId: string; projectName: string; clients: Client[] }>();
  for (const c of clients) {
    const key = c.project_id;
    const projectName = c.project_name ?? "Unknown project";
    if (!groups.has(key)) {
      groups.set(key, { projectId: c.project_id, projectName, clients: [] });
    }
    groups.get(key)!.clients.push(c);
  }
  return groups;
}

export default async function ClientsPage() {
  const token = (await cookies()).get("session")?.value;
  const clients = await getClients(token);
  const groups = Array.from(groupByProject(clients).values()).sort((a, b) =>
    a.projectName.localeCompare(b.projectName)
  );

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Clients work</h1>
      <p className="mb-5 text-sm text-silver">Every company subscribed to a Solura platform, grouped by platform.</p>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No clients yet — add one from a project&apos;s own page.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.projectId}>
              <Link
                href={`/projects/${g.projectId}`}
                className="mb-2 inline-block text-xs font-bold uppercase tracking-wide text-silver-dim hover:text-white"
              >
                {g.projectName} ↗
              </Link>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.clients.map((c) => (
                  <Link
                    key={c.id}
                    href={`/clients/${c.id}`}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
                  >
                    <div className="font-display text-base font-bold text-white">{c.name}</div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                        c.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                      }`}
                    >
                      {c.status}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
