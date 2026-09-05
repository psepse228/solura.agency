// solura-eco/frontend/src/components/NewPageDialog.tsx
// Creates a page natively in the platform (path under platform/...),
// no vault round-trip needed -- for notes born here, not in Obsidian.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

const CATEGORIES = ["entities", "concepts", "skills", "project", "references"] as const;

export function NewPageDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("concepts");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setTitle("");
    setCategory("concepts");
    setSummary("");
    setBody("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch("/api/brain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        category,
        summary: summary.trim() || null,
        body_markdown: body,
        tags: [],
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const resBody = await res.json().catch(() => ({}));
      setError(resBody.error ?? "Couldn't create page");
      return;
    }

    const created = (await res.json()) as { id: string };
    setOpen(false);
    reset();
    router.push(`/brain/${created.id}`);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        + New page
      </button>

      <Modal
        open={open}
        title="New page"
        onClose={() => {
          setOpen(false);
          reset();
        }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Title</span>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
          </label>

          <label>
            <span className="field-label">Category</span>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c} className="bg-bg2">
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span className="field-label">Summary</span>
            <input className="field" value={summary} onChange={(e) => setSummary(e.target.value)} />
          </label>

          <label>
            <span className="field-label">
              Body (Markdown — use <code>[[path|Label]]</code> to link another page)
            </span>
            <textarea className="field font-mono" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                reset();
              }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={!title.trim() || saving} className="btn-primary">
              {saving ? "Creating…" : "Create page"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
