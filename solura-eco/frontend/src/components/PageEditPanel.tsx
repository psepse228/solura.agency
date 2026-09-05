// solura-eco/frontend/src/components/PageEditPanel.tsx
// Editing a Brain/Database page from the platform instead of only in
// Obsidian. For a page that came from the vault sync, this is a stopgap:
// a future re-sync of that same vault path overwrites what's typed here,
// since the vault file is still that path's long-term source of truth.
// Pages created through the app (New page, platform/... path) don't have
// that problem -- nothing else ever writes to their path.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";

const CATEGORIES = ["entities", "concepts", "skills", "project", "references"] as const;
const TIERS = ["", "core", "reference"] as const;

type Props = {
  pageId: string;
  isPlatformPage: boolean;
  initial: {
    title: string;
    category: string | null;
    tags: string[] | null;
    summary: string | null;
    tier: string | null;
    body_markdown: string;
  };
};

export function PageEditPanel({ pageId, isPlatformPage, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category ?? "");
  const [tags, setTags] = useState((initial.tags ?? []).join(", "));
  const [summary, setSummary] = useState(initial.summary ?? "");
  const [tier, setTier] = useState(initial.tier ?? "");
  const [body, setBody] = useState(initial.body_markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/brain/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        category: category || null,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        summary: summary.trim() || null,
        tier: tier || null,
        body_markdown: body,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Couldn't save");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    const res = await fetch(`/api/brain/${pageId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/brain");
      router.refresh();
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary shrink-0">
        Edit
      </button>

      <Modal open={open} title="Edit page" onClose={() => setOpen(false)}>
        {!isPlatformPage && (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
            This page is synced from the Obsidian Vault. Edits here stay until the vault is re-synced from that same
            path — then the vault file wins.
          </p>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Title</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Category</span>
              <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="" className="bg-bg2">
                  —
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-bg2">
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Tier</span>
              <select className="field" value={tier} onChange={(e) => setTier(e.target.value)}>
                {TIERS.map((t) => (
                  <option key={t} value={t} className="bg-bg2">
                    {t || "—"}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            <span className="field-label">Tags (comma-separated)</span>
            <input className="field" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>

          <label>
            <span className="field-label">Summary</span>
            <input className="field" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>

          <label>
            <span className="field-label">
              Body (Markdown — use <code>[[path|Label]]</code> to link another page)
            </span>
            <textarea
              className="field font-mono"
              rows={12}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="mt-1 flex items-center justify-between gap-2">
            <button type="button" onClick={() => setConfirmingDelete(true)} className="text-[11px] text-silver-dim hover:text-red-400">
              Delete page
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={!title.trim() || saving} className="btn-primary">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this page?"
        body={`"${title}" will be permanently removed from the Brain/Database.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </>
  );
}
