// solura-eco/frontend/src/app/api/documents/[id]/download/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;

  const res = await fetch(`${apiUrl}/documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to get download link" }, { status: res.status });
  }

  const { url } = (await res.json()) as { url: string };
  return NextResponse.redirect(url);
}
