// solura-eco/frontend/src/app/api/login/route.ts
//
// Proxies credentials to the backend, then sets the returned token as a
// first-party cookie on THIS domain. Required because the frontend
// (Vercel) and backend (Railway) are different domains -- a Set-Cookie
// from the backend's response can't be stored as first-party here.
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { username, password } = await request.json();

  const backendRes = await fetch(`${apiUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!backendRes.ok) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const { token } = (await backendRes.json()) as { token: string };

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 3600,
  });
  return response;
}
