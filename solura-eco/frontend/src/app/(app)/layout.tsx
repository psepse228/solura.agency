import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Sidebar } from "@/components/Sidebar";
import type { UrgentData } from "@/components/UrgentPanel";
import { verifySessionToken } from "@/lib/session";

async function getUrgent(token: string | undefined): Promise<UrgentData | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || !token) return null;
  try {
    const res = await fetch(`${apiUrl}/me/urgent`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UrgentData;
  } catch {
    // A network hiccup here should never block the whole app shell from
    // rendering -- the panel just silently doesn't show, same as the
    // empty-state case.
    return null;
  }
}

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

  const urgent = await getUrgent(token);

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar username={session.username} urgent={urgent} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
