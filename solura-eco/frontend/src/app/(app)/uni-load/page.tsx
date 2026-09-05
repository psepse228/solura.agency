// solura-eco/frontend/src/app/(app)/uni-load/page.tsx
import { cookies } from "next/headers";

import { AssignmentList } from "@/components/AssignmentList";
import { CanvasTokenForm } from "@/components/CanvasTokenForm";
import { CourseGrid } from "@/components/CourseGrid";

type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};
type MyAssignmentsResponse = { has_token: boolean; assignments: Assignment[] };
type Course = {
  id: string;
  name: string;
  course_code: string | null;
  current_score: number | null;
  color: string | null;
};

async function getMyAssignments(token: string | undefined): Promise<MyAssignmentsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { has_token: false, assignments: [] };
  const res = await fetch(`${apiUrl}/canvas/my-assignments`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { has_token: false, assignments: [] };
  return (await res.json()) as MyAssignmentsResponse;
}

async function getMyCourses(token: string | undefined): Promise<Course[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/canvas/my-courses`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Course[];
}

export default async function UniLoadPage() {
  const token = (await cookies()).get("session")?.value;
  const [{ has_token, assignments }, courses] = await Promise.all([
    getMyAssignments(token),
    getMyCourses(token),
  ]);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Uni load</h1>
      <p className="mb-5 text-sm text-silver">Real courses, grades, and deadlines pulled straight from Canvas.</p>

      {!has_token ? (
        <CanvasTokenForm />
      ) : (
        <>
          <CourseGrid courses={courses} />
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">
            Upcoming Assignments
          </div>
          <AssignmentList assignments={assignments} />
        </>
      )}
    </div>
  );
}
