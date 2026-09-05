// solura-eco/frontend/src/components/ProjectEditPanel.tsx
// Every field on a project used to be write-once (set by a seed script,
// read-only forever after in the UI). This is the edit form for the
// fields the detail page only used to display: status, progress,
// repo/deploy linkage, accent gradient, and the About blurb.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

const STATUSES = ["active", "paused", "done"] as const;

type Props = {
  projectId: string;
  initial: {
    name: string;
    status: string;
    progress: number;
    github_repo: string | null;
    vercel_project: string | null;
    accent_start: string | null;
    accent_end: string | null;
    notes: string | null;
  };
};

export function ProjectEditPanel({ projectId, initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [status, setStatus] = useState(initial.status);
  const [progress, setProgress] = useState(initial.progress);
  const [githubRepo, setGithubRepo] = useState(initial.github_repo ?? "");
  const [vercelProject, setVercelProject] = useState(initial.vercel_project ?? "");
  const [accentStart, setAccentStart] = useState(initial.accent_start ?? "#38bdf8");
  const [accentEnd, setAccentEnd] = useState(initial.accent_end ?? "#818cf8");
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        status,
        progress,
        github_repo: githubRepo.trim() || null,
        vercel_project: vercelProject.trim() || null,
        accent_start: accentStart,
        accent_end: accentEnd,
        notes: notes.trim() || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't save");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary shrink-0">
        Edit
      </button>

      <Modal open={open} title="Edit project" onClose={() => setOpen(false)}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Name</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Status</span>
              <select className="field" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Progress ({progress}%)</span>
              <input
                type="range"
                min={0}
                max={100}
                value={progress}
                onChange={(e) => setProgress(Number(e.target.value))}
                className="mt-2.5 w-full accent-cyan"
              />
            </label>
          </div>

          <label>
            <span className="field-label">GitHub repo</span>
            <input
              className="field"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repo"
            />
          </label>

          <label>
            <span className="field-label">Vercel project</span>
            <input
              className="field"
              value={vercelProject}
              onChange={(e) => setVercelProject(e.target.value)}
              placeholder="vercel-project-name"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="field-label">Accent start</span>
              <input
                type="color"
                value={accentStart}
                onChange={(e) => setAccentStart(e.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-transparent"
              />
            </label>
            <label>
              <span className="field-label">Accent end</span>
              <input
                type="color"
                value={accentEnd}
                onChange={(e) => setAccentEnd(e.target.value)}
                className="h-8 w-full rounded-lg border border-border bg-transparent"
              />
            </label>
          </div>

          <label>
            <span className="field-label">About</span>
            <textarea className="field" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>

          {error && <p className="text-[11px] text-red-400">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={!name.trim() || saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
