// solura-eco/frontend/src/app/(app)/leads/page.tsx
import { cookies } from "next/headers";

import { LeadsBoard } from "@/components/LeadsBoard";

type Lead = {
  id: string;
  name: string;
  company_name: string | null;
  status: "new" | "contacted" | "qualified" | "converted" | "lost";
  source: string;
  contact_email: string | null;
  contact_phone: string | null;
  member_id: string | null;
  members: { full_name: string } | null;
};

async function getLeads(token: string | undefined): Promise<Lead[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/leads`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Lead[];
}

export default async function LeadsPage() {
  const token = (await cookies()).get("session")?.value;
  const leads = await getLeads(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Leads</h1>
      <p className="mb-5 text-sm text-silver">
        Prospective clients, tracked from first contact to converted (or lost) — manual for now, Telegram-sourced
        leads land here too once that&apos;s connected.
      </p>
      <LeadsBoard initialLeads={leads} />
    </div>
  );
}
