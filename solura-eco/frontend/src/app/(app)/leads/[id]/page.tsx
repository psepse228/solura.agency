// solura-eco/frontend/src/app/(app)/leads/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { TelegramThread } from "@/components/TelegramThread";

type Message = { id: string; direction: "inbound" | "outbound"; content: string; created_at: string };
type Conversation = {
  id: string;
  telegram_first_name: string | null;
  telegram_username: string | null;
  last_message_at: string | null;
  summary: string | null;
  next_step_suggestion: string | null;
  summary_generated_at: string | null;
};
type Thread = { conversation: Conversation; messages: Message[] } | null;

type LeadDetail = {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  source: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  member_id: string | null;
  converted_project_id: string | null;
  converted_client_id: string | null;
  created_at: string;
  members: { full_name: string } | null;
  projects: { id: string; name: string } | null;
};

async function fetchJSON<T>(path: string, token: string | undefined): Promise<T | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as T;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const [lead, thread] = await Promise.all([
    fetchJSON<LeadDetail>(`/leads/${id}`, token),
    fetchJSON<Thread>(`/leads/${id}/telegram`, token),
  ]);

  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-2xl px-8 py-8 animate-fade-in-up">
      <Link href="/leads" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All leads
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{lead.name}</h1>
        <span className="shrink-0 rounded-full bg-silver/15 px-2 py-0.5 text-[10px] font-bold capitalize text-silver">
          {lead.status}
        </span>
      </div>

      <div className="flex flex-col gap-4">
        {lead.converted_client_id && lead.projects && (
          <Link
            href={`/clients/${lead.converted_client_id}`}
            className="flex flex-col gap-1 rounded-2xl border border-cyan/30 bg-cyan/5 p-4 transition-colors hover:border-cyan/50"
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-cyan">Converted</div>
            <div className="font-display text-base font-bold text-white">
              Now a client of {lead.projects.name} ↗
            </div>
          </Link>
        )}

        {(lead.company_name || lead.contact_email || lead.contact_phone) && (
          <div className="panel">
            <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Contact</div>
            <div className="flex flex-col gap-1 text-[12.5px] text-silver">
              {lead.company_name && <div>{lead.company_name}</div>}
              {lead.contact_email && <div>{lead.contact_email}</div>}
              {lead.contact_phone && <div>{lead.contact_phone}</div>}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-silver-dim">Details</div>
          <div className="flex flex-col gap-1 text-[12.5px] text-silver">
            <div>Owner: {lead.members?.full_name ?? "Unassigned"}</div>
            <div>Source: {lead.source}</div>
            <div>Added: {new Date(lead.created_at).toLocaleDateString()}</div>
          </div>
        </div>

        {lead.notes && (
          <div className="panel">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-silver-dim">Notes</div>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-silver">{lead.notes}</p>
          </div>
        )}

        {thread && <TelegramThread thread={thread} />}
      </div>
    </div>
  );
}
