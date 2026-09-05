// solura-eco/frontend/src/components/GraphView.tsx
// An Obsidian-style force-directed graph of the Brain/Database's real
// pages -- nodes sized by how many pages link to them, colored by
// category, click to open. Canvas-based (force-graph), no React
// re-render on every physics tick.
"use client";

import type { LinkObject, NodeObject } from "force-graph";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

type Node = { id: string; label: string; category: string | null };
type Edge = { source: string; target: string };
// force-graph mutates each node object in place (adding x/y/vx/vy at
// runtime), so the shape it hands back to callbacks is our own fields
// plus its own NodeObject fields -- not a bare Record. ForceGraph is
// generic over this node type; without pinning it explicitly at
// construction, every callback below would type as the library's bare
// default NodeObject instead of our real shape.
type GraphNode = Node & NodeObject;
type GraphLink = LinkObject<GraphNode>;

const CATEGORY_COLOR: Record<string, string> = {
  entities: "#38bdf8",
  concepts: "#818cf8",
  skills: "#34d399",
  project: "#f472b6",
  references: "#fbbf24",
};
const DEFAULT_COLOR = "#94a3b8";

export function GraphView({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current || nodes.length === 0) return;
    let destroyed = false;
    let graph: import("force-graph").default<GraphNode, GraphLink> | null = null;

    const degree: Record<string, number> = {};
    for (const e of edges) {
      degree[e.source] = (degree[e.source] ?? 0) + 1;
      degree[e.target] = (degree[e.target] ?? 0) + 1;
    }

    import("force-graph").then(({ default: ForceGraph }) => {
      if (destroyed || !containerRef.current) return;

      graph = new ForceGraph<GraphNode, GraphLink>(containerRef.current)
        .graphData({
          nodes: nodes.map((n) => ({ ...n })),
          links: edges.map((e) => ({ ...e })),
        })
        .backgroundColor("#080c12")
        .nodeId("id")
        .nodeLabel("label")
        .nodeColor((n: GraphNode) => CATEGORY_COLOR[n.category ?? ""] ?? DEFAULT_COLOR)
        .nodeVal((n: GraphNode) => 1.5 + (degree[n.id!] ?? 0) * 0.8)
        .nodeRelSize(3)
        .linkColor(() => "rgba(255,255,255,0.12)")
        .linkWidth(1)
        .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.label;
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          const val = 1.5 + (degree[node.id!] ?? 0) * 0.8;
          const r = Math.sqrt(val) * 3;

          ctx.beginPath();
          ctx.arc(x, y, r, 0, 2 * Math.PI);
          ctx.fillStyle = CATEGORY_COLOR[node.category ?? ""] ?? DEFAULT_COLOR;
          ctx.fill();

          const fontSize = Math.max(10 / globalScale, 3);
          ctx.font = `${fontSize}px DM Sans, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = "rgba(241,245,249,0.85)";
          ctx.fillText(label, x, y + r + 2);
        })
        .onNodeClick((node: GraphNode) => {
          router.push(`/brain/${node.id}`);
        })
        .onNodeHover((node: GraphNode | null) => {
          if (containerRef.current) {
            containerRef.current.style.cursor = node ? "pointer" : "default";
          }
        });

      const resize = () => {
        if (containerRef.current && graph) {
          graph.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight);
        }
      };
      resize();
      window.addEventListener("resize", resize);

      return () => window.removeEventListener("resize", resize);
    });

    return () => {
      destroyed = true;
      if (graph) {
        graph._destructor?.();
      }
    };
  }, [nodes, edges, router]);

  if (nodes.length === 0) {
    return (
      <div className="panel text-center">
        <p className="text-sm text-silver">Nothing synced yet.</p>
      </div>
    );
  }

  return <div ref={containerRef} className="h-[600px] w-full overflow-hidden rounded-2xl border border-border" />;
}
