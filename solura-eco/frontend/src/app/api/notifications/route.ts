import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const token = (await cookies()).get("session")?.value;
  const res = await fetch(`${apiUrl}/notifications`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to load notifications" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
