// solura-eco/frontend/src/app/(app)/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type Member = { id: string; full_name: string };
type Project = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  progress: number;
  accent_start: string | null;
  accent_end: string | null;
  dev_members: Member[];
  client_work_members: Member[];
  last_activity_at: string | null;
};
type Stats = {
  active_projects: number;
  active_clients: number;
  commits_this_week: number;
  avg_progress: number;
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function fetchJSON<T>(path: string, token: string | undefined): Promise<T | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  try {
    const res = await fetch(`${apiUrl}${path}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "no activity";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function Avatar({ member }: { member: Member }) {
  return (
    <div
      className="-ml-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-bg2 bg-bg3 text-[9px] font-bold text-white outline outline-1 outline-border first:ml-0"
      title={member.full_name}
    >
      {member.full_name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export default async function Home() {
  const token = (await cookies()).get("session")?.value;
  const [projects, stats] = await Promise.all([
    fetchJSON<Project[]>("/projects", token),
    fetchJSON<Stats>("/projects/stats", token),
  ]);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Projects</h1>
      <p className="mt-1 text-sm text-silver">
        Every project Solura&apos;s running, at a glance — click one for the full picture.
      </p>

      {!projects || !stats ? (
        <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Could not reach the backend — showing nothing until it&apos;s reachable.
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["Active projects", stats.active_projects],
                ["Active clients", stats.active_clients],
                ["Commits this week", stats.commits_this_week],
                ["Avg. progress", `${stats.avg_progress}%`],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-bg2 p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-silver-dim">{label}</div>
                <div className="mt-1 font-display text-2xl font-extrabold">{value}</div>
              </div>
            ))}
          </div>

          {projects.length === 0 ? (
            <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-silver">
              No projects yet.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => {
                const [start, end] =
                  p.accent_start && p.accent_end ? [p.accent_start, p.accent_end] : DEFAULT_GRADIENT;
                const gradient = `linear-gradient(135deg, ${start}, ${end})`;
                const people = [...p.dev_members, ...p.client_work_members].slice(0, 3);
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-bold">{p.name}</div>
                        <div className="mt-0.5 text-xs text-silver-dim">{p.client_name ?? "—"}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                          p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg3">
                        <div
                          className="h-full rounded-full transition-[width] duration-700 ease-out"
                          style={{ width: `${p.progress}%`, backgroundImage: gradient }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex">
                        {people.map((m) => (
                          <Avatar key={m.id} member={m} />
                        ))}
                      </div>
                      <span className="text-[11px] text-silver-dim">{timeAgo(p.last_activity_at)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
