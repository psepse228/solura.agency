import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const token = (await cookies()).get("session")?.value;
  const res = await fetch(`${apiUrl}/me/summary`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Couldn't generate a summary" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
