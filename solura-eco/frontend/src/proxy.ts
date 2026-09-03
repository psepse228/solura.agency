// solura-eco/frontend/src/proxy.ts
//
// Next.js 16 renamed middleware.js -> proxy.ts (same mechanism, new name).
// This is an OPTIMISTIC check only, per Next's own guidance: it redirects
// obviously-unauthenticated requests before they render, but the backend's
// require_session dependency (app/auth/deps.py) is the real authorization
// boundary -- this file must never be the only thing standing between a
// request and real data.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { verifySessionToken } from "@/lib/session";

const PUBLIC_ROUTES = ["/login"];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.includes(pathname)) {
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Misconfigured deployment (env var not set) -- fail closed rather
    // than silently letting every request through.
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const token = req.cookies.get("session")?.value;
  const session = await verifySessionToken(token, secret);

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$).*)"],
};
