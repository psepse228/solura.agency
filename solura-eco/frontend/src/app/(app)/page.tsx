// solura-eco/frontend/src/app/(app)/page.tsx
// The welcome/dashboard page -- one small box per section of the
// platform, each with a real live summary, linking through to the full
// page. The full Projects grid lives at /projects now.
import Link from "next/link";
import { cookies } from "next/headers";

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

type Stats = { active_projects: number };
type Task = { status: string };
type Client = { id: string };
type Document = { id: string };
type MyAssignments = { has_token: boolean; assignments: { due_at: string | null; status: string }[] };

function Tile({
  href,
  live,
  title,
  value,
  subtitle,
}: {
  href: string;
  live: boolean;
  title: string;
  value: string;
  subtitle: string;
}) {
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-bold uppercase tracking-wide text-silver-dim">{title}</div>
        {!live && (
          <span className="shrink-0 rounded-full bg-silver/15 px-1.5 py-0.5 text-[9px] font-bold text-silver">
            Soon
          </span>
        )}
      </div>
      <div className="mt-2 font-display text-2xl font-extrabold text-white">{value}</div>
      <div className="mt-0.5 text-[11.5px] text-silver-dim">{subtitle}</div>
    </>
  );

  const className =
    "flex flex-col rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200" +
    (live ? " hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20" : " opacity-60");

  return live ? (
    <Link href={href} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

export default async function WelcomePage() {
  const token = (await cookies()).get("session")?.value;
  const [stats, tasks, clients, documents, myAssignments] = await Promise.all([
    fetchJSON<Stats>("/projects/stats", token),
    fetchJSON<Task[]>("/tasks", token),
    fetchJSON<Client[]>("/clients", token),
    fetchJSON<Document[]>("/documents", token),
    fetchJSON<MyAssignments>("/canvas/my-assignments", token),
  ]);

  const openTasks = (tasks ?? []).filter((t) => t.status !== "done").length;
  const dueSoon = (myAssignments?.assignments ?? []).filter(
    (a) => a.status !== "graded" && a.status !== "submitted"
  ).length;

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Welcome to Solura Eco</h1>
      <p className="mt-1 text-sm text-silver">Everything Solura runs on, in one place.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          href="/projects"
          live
          title="Projects"
          value={stats ? String(stats.active_projects) : "—"}
          subtitle="active right now"
        />
        <Tile
          href="/tasks"
          live
          title="Tasks"
          value={tasks ? String(openTasks) : "—"}
          subtitle="open, not done"
        />
        <Tile
          href="/clients"
          live
          title="Clients work"
          value={clients ? String(clients.length) : "—"}
          subtitle="companies subscribed"
        />
        <Tile
          href="/uni-load"
          live
          title="Uni load"
          value={myAssignments?.has_token ? String(dueSoon) : "—"}
          subtitle={myAssignments?.has_token ? "assignments outstanding" : "connect your Canvas token"}
        />
        <Tile
          href="/docs"
          live
          title="Docs & КП"
          value={documents ? String(documents.length) : "—"}
          subtitle="documents on file"
        />
        <Tile href="/leads" live={false} title="Leads" value="—" subtitle="waiting on Telegram Business" />
      </div>
    </div>
  );
}
