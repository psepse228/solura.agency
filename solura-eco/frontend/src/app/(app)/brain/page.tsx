// solura-eco/frontend/src/app/(app)/brain/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type WikiPage = {
  id: string;
  path: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  summary: string | null;
  tier: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  entities: "Entities",
  concepts: "Concepts",
  skills: "Skills",
  project: "Projects",
  references: "References",
};

async function getPages(token: string | undefined): Promise<WikiPage[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/brain`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as WikiPage[];
}

function groupByCategory(pages: WikiPage[]): [string, WikiPage[]][] {
  const groups = new Map<string, WikiPage[]>();
  for (const p of pages) {
    const key = p.category ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function BrainPage() {
  const token = (await cookies()).get("session")?.value;
  const pages = await getPages(token);
  const groups = groupByCategory(pages);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Brain / Database</h1>
      <p className="mb-5 text-sm text-silver">
        Solura&apos;s real knowledge base — synced from the team&apos;s Obsidian Vault.
      </p>

      {pages.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">Nothing synced yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([category, categoryPages]) => (
            <div key={category}>
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-silver-dim">
                {CATEGORY_LABELS[category] ?? category}
              </div>
              <div className="flex flex-col gap-2">
                {categoryPages.map((p) => (
                  <Link
                    key={p.id}
                    href={`/brain/${p.id}`}
                    className="row-hover flex flex-col gap-1 rounded-lg border border-border bg-bg2 px-4 py-3"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13.5px] font-medium text-white">{p.title}</span>
                      {p.tier === "core" && (
                        <span className="shrink-0 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                          core
                        </span>
                      )}
                    </div>
                    {p.summary && <p className="truncate text-[11.5px] text-silver-dim">{p.summary}</p>}
                    {p.tags && p.tags.length > 0 && (
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {p.tags.slice(0, 5).map((t) => (
                          <span key={t} className="rounded-full bg-bg3 px-1.5 py-0.5 text-[9px] text-silver-dim">
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
