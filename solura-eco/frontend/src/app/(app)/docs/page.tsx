// solura-eco/frontend/src/app/(app)/docs/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";

type Document = {
  id: string;
  filename: string;
  doc_type: string;
  size_bytes: number;
  created_at: string;
  project_id: string;
  project_name: string | null;
  uploaded_by_name: string | null;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  kp: "КП",
  presentation: "Presentation",
  other: "Other",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getDocuments(token: string | undefined): Promise<Document[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/documents`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Document[];
}

export default async function DocsPage() {
  const token = (await cookies()).get("session")?.value;
  const documents = await getDocuments(token);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-1 font-display text-2xl font-extrabold tracking-tight text-white">Docs &amp; КП</h1>
      <p className="mb-5 text-sm text-silver">
        Every КП and presentation across every project — upload happens on the project's own page.
      </p>

      {documents.length === 0 ? (
        <div className="rounded-2xl border border-border bg-bg2 p-8 text-center">
          <p className="text-sm text-silver">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="animate-fade-in-up flex items-center justify-between gap-2 rounded-lg border border-border bg-bg2 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[13.5px] font-medium text-white">{d.filename}</span>
                  <span className="shrink-0 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-silver-dim">
                  <Link href={`/projects/${d.project_id}`} className="hover:text-white hover:underline">
                    {d.project_name ?? "Unknown project"}
                  </Link>
                  {" · "}
                  {d.uploaded_by_name ?? "Unknown"} · {formatSize(d.size_bytes)}
                </div>
              </div>
              <a
                href={`/api/documents/${d.id}/download`}
                className="shrink-0 text-[11px] text-cyan hover:underline"
              >
                Download
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
