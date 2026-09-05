// solura-eco/frontend/src/app/(app)/brain/page.tsx
import { cookies } from "next/headers";

import { BrainBrowser } from "@/components/BrainBrowser";
import { NewPageDialog } from "@/components/NewPageDialog";

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
type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };

async function fetchJSON<T>(path: string, token: string | undefined, fallback: T): Promise<T> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return fallback;
  const res = await fetch(`${apiUrl}${path}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return fallback;
  return (await res.json()) as T;
}

export default async function BrainPage() {
  const token = (await cookies()).get("session")?.value;
  const [pages, graph] = await Promise.all([
    fetchJSON<WikiPage[]>("/brain", token, []),
    fetchJSON<GraphData>("/brain/graph", token, { nodes: [], edges: [] }),
  ]);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Brain / Database</h1>
          <p className="text-sm text-silver">
            Solura&apos;s real knowledge base — synced from the team&apos;s Obsidian Vault, editable here too.
          </p>
        </div>
        <NewPageDialog />
      </div>

      <BrainBrowser pages={pages} graphNodes={graph.nodes} graphEdges={graph.edges} />
    </div>
  );
}
