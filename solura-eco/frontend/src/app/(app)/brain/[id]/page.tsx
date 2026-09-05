// solura-eco/frontend/src/app/(app)/brain/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { marked } from "marked";

import { PageEditPanel } from "@/components/PageEditPanel";

type WikiPageDetail = {
  id: string;
  path: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  summary: string | null;
  tier: string | null;
  lifecycle: string | null;
  body_markdown: string;
  wiki_updated_at: string | null;
};

async function getPage(id: string, token: string | undefined): Promise<WikiPageDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/brain/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as WikiPageDetail;
}

// Obsidian [[path|Label]] / [[path]] wikilinks aren't real links in this
// first pass (would need a path->id lookup to cross-navigate) -- rendered
// as styled text instead of silently breaking as literal double brackets.
function stripWikilinks(markdown: string): string {
  return markdown.replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_match, path: string, _pipe, label?: string) => {
    const text = label ?? path.split("/").pop() ?? path;
    return `**${text}**`;
  });
}

export default async function BrainDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const page = await getPage(id, token);

  if (!page) notFound();

  const html = marked.parse(stripWikilinks(page.body_markdown), { async: false }) as string;

  return (
    <div className="mx-auto max-w-3xl px-8 py-8 animate-fade-in-up">
      <Link href="/brain" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← Brain / Database
      </Link>

      <div className="mb-1 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{page.title}</h1>
          {page.tier === "core" && (
            <span className="shrink-0 rounded-full bg-cyan/15 px-2 py-0.5 text-[10px] font-bold text-cyan">core</span>
          )}
        </div>
        <PageEditPanel
          pageId={page.id}
          isPlatformPage={page.path.startsWith("platform/")}
          initial={{
            title: page.title,
            category: page.category,
            tags: page.tags,
            summary: page.summary,
            tier: page.tier,
            body_markdown: page.body_markdown,
          }}
        />
      </div>
      <p className="mb-1 text-xs text-silver-dim">
        {page.path}
        {page.wiki_updated_at && ` · updated ${new Date(page.wiki_updated_at).toLocaleDateString()}`}
      </p>
      {page.tags && page.tags.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1">
          {page.tags.map((t) => (
            <span key={t} className="rounded-full bg-bg3 px-1.5 py-0.5 text-[10px] text-silver-dim">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div
        className="panel prose-invert max-w-none text-[13px] leading-relaxed text-silver [&_a]:text-cyan [&_a]:no-underline [&_a:hover]:underline [&_h1]:mt-0 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:text-sm [&_h3]:font-bold [&_h3]:text-white [&_li]:my-1 [&_p]:my-2.5 [&_strong]:text-white [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-white/10 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-white/10 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_code]:rounded [&_code]:bg-bg3 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[11.5px]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
