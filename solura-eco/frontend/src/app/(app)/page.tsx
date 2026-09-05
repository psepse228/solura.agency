// solura-eco/frontend/src/app/(app)/page.tsx
// The home page -- a single merged activity feed instead of a grid of
// static stat tiles (which looked empty at today's data volume). A
// one-line stats strip keeps quick orientation without needing a grid.
import { cookies } from "next/headers";

import { ActivityFeed } from "@/components/ActivityFeed";
import { MyDayPanel } from "@/components/MyDayPanel";

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
type ActivityItem = {
  type: "dev_event" | "task" | "client" | "document";
  id: string;
  label: string;
  sub: string;
  href: string | null;
  at: string;
};
type MyDay = {
  tasks: {
    id: string;
    title: string;
    status: string;
    priority: "low" | "normal" | "high";
    due_at: string | null;
    client_name: string | null;
    subtasks_done: number;
    subtasks_total: number;
  }[];
  canvas_deadlines: {
    id: string;
    name: string;
    course_name: string | null;
    due_at: string;
    html_url: string | null;
    overdue: boolean;
  }[];
};

export default async function WelcomePage() {
  const token = (await cookies()).get("session")?.value;
  const [stats, tasks, clients, activity, myDay] = await Promise.all([
    fetchJSON<Stats>("/projects/stats", token),
    fetchJSON<Task[]>("/tasks", token),
    fetchJSON<Client[]>("/clients", token),
    fetchJSON<ActivityItem[]>("/me/activity", token),
    fetchJSON<MyDay>("/me/day", token),
  ]);

  const openTasks = (tasks ?? []).filter((t) => t.status !== "done").length;

  return (
    <div className="mx-auto max-w-3xl px-8 py-8 animate-fade-in-up">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Welcome to Solura Eco</h1>
      <p className="mt-1 text-sm text-silver">
        {stats ? stats.active_projects : "—"} active {stats?.active_projects === 1 ? "project" : "projects"} ·{" "}
        {tasks ? openTasks : "—"} open {openTasks === 1 ? "task" : "tasks"} ·{" "}
        {clients ? clients.length : "—"} {clients?.length === 1 ? "client" : "clients"}
      </p>

      <div className="mt-6">
        <MyDayPanel tasks={myDay?.tasks ?? []} canvasDeadlines={myDay?.canvas_deadlines ?? []} />
      </div>

      <div className="mt-6 mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Recent activity</div>
      <ActivityFeed items={activity ?? []} />
    </div>
  );
}
