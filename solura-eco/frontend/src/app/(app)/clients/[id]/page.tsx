// solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ProgressBar } from "@/components/ProgressBar";

type Project = {
  id: string;
  name: string;
  status: string;
  progress: number;
  accent_start: string | null;
  accent_end: string | null;
};
type ClientDetail = {
  id: string;
  name: string;
  status: string;
  projects: Project[];
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function getClient(id: string, token: string | undefined): Promise<ClientDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/clients/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as ClientDetail;
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const client = await getClient(id, token);

  if (!client) notFound();

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All projects
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{client.name}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
            client.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
          }`}
        >
          {client.status}
        </span>
      </div>

      {client.projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-silver">
          No projects yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {client.projects.map((p) => {
            const [start, end] =
              p.accent_start && p.accent_end ? [p.accent_start, p.accent_end] : DEFAULT_GRADIENT;
            const gradient = `linear-gradient(135deg, ${start}, ${end})`;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
              >
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-base font-bold">{p.name}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                      p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar progress={p.progress} gradient={gradient} />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                    {p.progress}%
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
