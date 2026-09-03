// solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { NotesPanel } from "@/components/NotesPanel";

type Member = { id: string; full_name: string };
type DevEvent = { id: string; actor: string | null; message: string; url: string | null; occurred_at: string };
type Note = { id: string; body: string; author: string; created_at: string };
type ProjectDetail = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
  progress: number;
  github_repo: string | null;
  accent_start: string | null;
  accent_end: string | null;
  notes: string | null;
  dev_members: Member[];
  client_work_members: Member[];
  recent_events: DevEvent[];
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function getProject(id: string, token: string | undefined): Promise<ProjectDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/projects/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as ProjectDetail;
}

async function getProjectNotes(id: string, token: string | undefined): Promise<Note[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/projects/${id}/notes`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Note[];
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function RoleList({ title, members }: { title: string; members: Member[] }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="mb-2 text-[11px] font-semibold text-silver-dim">{title}</div>
      {members.length === 0 ? (
        <p className="text-xs italic text-silver-dim">Unassigned</p>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-border bg-bg3 text-[10px] font-bold">
                {m.full_name.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-medium">{m.full_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const [project, notes] = await Promise.all([getProject(id, token), getProjectNotes(id, token)]);

  if (!project) notFound();

  const [start, end] =
    project.accent_start && project.accent_end ? [project.accent_start, project.accent_end] : DEFAULT_GRADIENT;
  const gradient = `linear-gradient(135deg, ${start}, ${end})`;

  let lastDay = "";

  return (
    <div className="px-8 py-8">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All projects
      </Link>

      <div className="mb-6 flex items-start gap-3.5">
        <div className="h-11 w-11 shrink-0 rounded-xl" style={{ backgroundImage: gradient }} />
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{project.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-silver">
            <span>{project.client_name ?? "—"}</span>
            {project.github_repo && (
              <>
                <span>·</span>
                <a
                  href={`https://github.com/${project.github_repo}`}
                  target="_blank"
                  className="text-silver-dim hover:text-white"
                >
                  {project.github_repo} ↗
                </a>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-wide text-silver-dim">Progress</div>
            <div className="flex items-center gap-3.5">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg3">
                <div className="h-full rounded-full" style={{ width: `${project.progress}%`, backgroundImage: gradient }} />
              </div>
              <div className="font-display text-xl font-extrabold tabular-nums">{project.progress}%</div>
            </div>
            <div className="mt-3.5 flex gap-6 border-t border-white/5 pt-3.5">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Status</div>
                <div className="mt-0.5 font-display text-sm font-bold capitalize">{project.status}</div>
              </div>
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-silver-dim">Recent commits</div>
                <div className="mt-0.5 font-display text-sm font-bold">{project.recent_events.length}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Activity</div>
            {project.recent_events.length === 0 ? (
              <p className="text-sm text-silver">{project.github_repo ? "No commits yet." : "No repo linked."}</p>
            ) : (
              <div className="flex flex-col">
                {project.recent_events.map((e) => {
                  const day = formatDay(e.occurred_at);
                  const showDay = day !== lastDay;
                  lastDay = day;
                  return (
                    <div key={e.id}>
                      {showDay && (
                        <div className="mb-2 mt-3.5 text-[11px] font-bold uppercase tracking-wide text-silver-dim first:mt-0">
                          {day}
                        </div>
                      )}
                      <div className="flex gap-3 border-b border-white/5 py-2 last:border-0">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ backgroundImage: gradient }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] text-white">
                            {e.url ? (
                              <a href={e.url} target="_blank" className="hover:underline">
                                {e.message}
                              </a>
                            ) : (
                              e.message
                            )}
                          </div>
                          <div className="mt-0.5 text-[11px] text-silver-dim">
                            {e.actor && <b className="font-medium text-silver">{e.actor}</b>}
                            {e.actor && " · "}
                            {new Date(e.occurred_at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-border bg-bg2 p-5">
            <div className="mb-4 text-xs font-bold uppercase tracking-wide text-silver-dim">Roles</div>
            <RoleList title="Development" members={project.dev_members} />
            <RoleList title="Client work" members={project.client_work_members} />
          </div>

          {project.notes && (
            <div className="rounded-2xl border border-border bg-bg2 p-5">
              <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">About</div>
              <p className="text-[12.5px] leading-relaxed text-silver">{project.notes}</p>
            </div>
          )}

          <NotesPanel projectId={project.id} initialNotes={notes ?? []} />
        </div>
      </div>
    </div>
  );
}
