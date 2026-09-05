import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const token = (await cookies()).get("session")?.value;
  const res = await fetch(`${apiUrl}/search?q=${encodeURIComponent(q)}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Search failed" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
