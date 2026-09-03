// solura-eco/frontend/src/app/api/projects/[id]/documents/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const formData = await request.formData();

  const res = await fetch(`${apiUrl}/projects/${id}/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Upload failed" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
