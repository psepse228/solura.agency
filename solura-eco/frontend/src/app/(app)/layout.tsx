import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";
import { verifySessionToken } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get("session")?.value;
  const secret = process.env.SESSION_SECRET;
  const session = secret ? await verifySessionToken(token, secret) : null;

  // proxy.ts already redirects unauthenticated requests before this layout
  // ever renders -- this is a defensive fallback (e.g. SESSION_SECRET
  // misconfigured differently between proxy and here), not the primary
  // auth gate.
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar username={session.username} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
