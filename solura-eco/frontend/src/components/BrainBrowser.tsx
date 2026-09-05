// solura-eco/frontend/src/components/BrainBrowser.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { GraphView } from "@/components/GraphView";

type WikiPage = {
  id: string;
  path: string;
  title: string;
  category: string | null;
  tags: string[] | null;
  summary: string | null;
  tier: string | null;
};
type GraphNode = { id: string; label: string; category: string | null };
type GraphEdge = { source: string; target: string };

const CATEGORY_LABELS: Record<string, string> = {
  entities: "Entities",
  concepts: "Concepts",
  skills: "Skills",
  project: "Projects",
  references: "References",
};

function groupByCategory(pages: WikiPage[]): [string, WikiPage[]][] {
  const groups = new Map<string, WikiPage[]>();
  for (const p of pages) {
    const key = p.category ?? "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function BrainBrowser({
  pages,
  graphNodes,
  graphEdges,
}: {
  pages: WikiPage[];
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
}) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const groups = groupByCategory(pages);

  return (
    <div>
      <div className="mb-5 flex gap-1 self-start rounded-lg border border-border p-0.5" style={{ width: "fit-content" }}>
        {(["graph", "list"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors ${
              view === v ? "bg-bg3 text-white" : "text-silver-dim hover:text-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {pages.length === 0 ? (
        <div className="panel text-center">
          <p className="text-sm text-silver">Nothing synced yet.</p>
        </div>
      ) : view === "graph" ? (
        <GraphView nodes={graphNodes} edges={graphEdges} />
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
