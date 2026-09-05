// solura-eco/frontend/src/app/(app)/tasks/page.tsx
import { cookies } from "next/headers";

import { TaskBoard } from "@/components/TaskBoard";

type Task = {
  id: string;
  title: string;
  description: string | null;
  client_name: string | null;
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "low" | "normal" | "high";
  due_at: string | null;
  member_id: string | null;
  members: { full_name: string } | null;
};

async function getTasks(token: string | undefined): Promise<Task[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/tasks`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Task[];
}

export default async function TasksPage() {
  const token = (await cookies()).get("session")?.value;
  const tasks = await getTasks(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Tasks</h1>
      <p className="mb-5 text-sm text-silver">Client work, assigned and tracked — shared across all three of you.</p>
      <TaskBoard initialTasks={tasks} />
    </div>
  );
}
