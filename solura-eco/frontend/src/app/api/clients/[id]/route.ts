import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;

  const res = await fetch(`${apiUrl}/clients/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to delete client" }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
