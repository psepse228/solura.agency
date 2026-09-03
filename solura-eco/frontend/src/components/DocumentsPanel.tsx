// solura-eco/frontend/src/components/DocumentsPanel.tsx
"use client";

import { useState, type FormEvent } from "react";

type Document = {
  id: string;
  filename: string;
  doc_type: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
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

export function DocumentsPanel({
  projectId,
  initialDocuments,
}: {
  projectId: string;
  initialDocuments: Document[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [docType, setDocType] = useState("kp");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docType);

    const res = await fetch(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      return;
    }

    const doc = (await res.json()) as Document;
    setDocuments([doc, ...documents]);
    setFile(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document? This can't be undone.")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments(documents.filter((d) => d.id !== id));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Documents</div>

      <form onSubmit={handleUpload} className="mb-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs text-white"
          >
            <option value="kp" className="bg-bg2">
              КП
            </option>
            <option value="presentation" className="bg-bg2">
              Presentation
            </option>
            <option value="other" className="bg-bg2">
              Other
            </option>
          </select>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-xs text-silver file:mr-2 file:rounded-md file:border file:border-border file:bg-bg3 file:px-2 file:py-1 file:text-xs file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </form>

      {documents.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No documents yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="animate-fade-in-up flex items-center justify-between gap-2 rounded-lg bg-bg3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-white">{d.filename}</span>
                  <span className="shrink-0 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                  </span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-silver-dim">
                  {d.uploaded_by_name ?? "Unknown"} · {formatSize(d.size_bytes)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={`/api/documents/${d.id}/download`} className="text-[11px] text-cyan hover:underline">
                  Download
                </a>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-[11px] text-silver-dim hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
