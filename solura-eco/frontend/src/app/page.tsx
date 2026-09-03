import Link from "next/link";

type Project = {
  id: string;
  name: string;
  status: string;
  progress: number;
  github_repo: string | null;
};

type Client = {
  id: string;
  name: string;
  status: string;
  projects: Project[];
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  paused: "bg-amber-500/15 text-amber-400",
  completed: "bg-zinc-500/15 text-zinc-400",
  dropped: "bg-zinc-500/15 text-zinc-400",
  churned: "bg-red-500/15 text-red-400",
};

async function getClients(): Promise<{ clients: Client[] | null; error: string | null }> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return { clients: null, error: "NEXT_PUBLIC_API_URL is not set (see .env.example)." };
  }
  try {
    const res = await fetch(`${apiUrl}/clients`, { cache: "no-store" });
    if (!res.ok) {
      return { clients: null, error: `Backend returned ${res.status}` };
    }
    return { clients: await res.json(), error: null };
  } catch {
    return { clients: null, error: `Could not reach backend at ${apiUrl}` };
  }
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] ?? "bg-zinc-500/15 text-zinc-400"
      }`}
    >
      {status}
    </span>
  );
}

export default async function Home() {
  const { clients, error } = await getClients();

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12 sm:px-10">
        <header className="mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Solura Eco
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Every active client, at a glance — status and progress, no pinging required.
          </p>
        </header>

        {error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {error} — showing nothing until the backend is reachable.
          </div>
        )}

        {clients && clients.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            No clients yet. Add one via <code className="font-mono">POST /clients</code>.
          </div>
        )}

        {clients && clients.length > 0 && (
          <ul className="flex flex-col gap-4">
            {clients.map((client) => (
              <li
                key={client.id}
                className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-medium text-zinc-950 dark:text-zinc-50">{client.name}</h2>
                  <StatusPill status={client.status} />
                </div>

                {client.projects.length > 0 ? (
                  <ul className="mt-3 flex flex-col gap-2">
                    {client.projects.map((project) => (
                      <li
                        key={project.id}
                        className="flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate text-zinc-800 dark:text-zinc-200">
                            {project.name}
                          </span>
                          {project.github_repo && (
                            <Link
                              href={`https://github.com/${project.github_repo}`}
                              target="_blank"
                              className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                            >
                              {project.github_repo}
                            </Link>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                            <div
                              className="h-full rounded-full bg-zinc-900 dark:bg-zinc-200"
                              style={{ width: `${project.progress}%` }}
                            />
                          </div>
                          <StatusPill status={project.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-zinc-400">No projects yet.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
