// solura-eco/frontend/src/app/(app)/uni-load/page.tsx
import { cookies } from "next/headers";

import { AssignmentList } from "@/components/AssignmentList";
import { CanvasTokenForm } from "@/components/CanvasTokenForm";

type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};
type MyAssignmentsResponse = { has_token: boolean; assignments: Assignment[] };

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

export default async function UniLoadPage() {
  const token = (await cookies()).get("session")?.value;
  const { has_token, assignments } = await getMyAssignments(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-5 font-display text-2xl font-extrabold tracking-tight text-white">Uni load</h1>

      {!has_token ? <CanvasTokenForm /> : <AssignmentList assignments={assignments} />}
    </div>
  );
}
