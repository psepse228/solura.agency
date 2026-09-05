// solura-eco/frontend/src/components/NewProjectDialog.tsx
// Creating a project used to mean asking Claude to run a seed script --
// this is the first real "do it yourself" entry point into the platform.
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Modal } from "@/components/Modal";

const STATUSES = ["active", "paused", "done"] as const;

export function NewProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("active");
  const [githubRepo, setGithubRepo] = useState("");
  const [vercelProject, setVercelProject] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setStatus("active");
    setGithubRepo("");
    setVercelProject("");
    setNotes("");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    setSaving(true);
    setError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        status,
        github_repo: githubRepo.trim() || null,
        vercel_project: vercelProject.trim() || null,
        notes: notes.trim() || null,
      }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't create project");
      return;
    }

    const created = (await res.json()) as { id: string };
    setOpen(false);
    reset();
    router.push(`/projects/${created.id}`);
    router.refresh();
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary">
        + New project
      </button>

      <Modal
        open={open}
        title="New project"
        onClose={() => {
          setOpen(false);
          reset();
        }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label>
            <span className="field-label">Name</span>
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Argus"
              autoFocus
              required
            />
          </label>

          <label>
            <span className="field-label">Status</span>
            <select className="field" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
              {STATUSES.map((s) => (
                <option key={s} value={s} className="bg-bg2">
                  {s}
                </option>
              ))}
            </select>
          </label>

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

          <label>
            <span className="field-label">About</span>
            <textarea
              className="field"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What is this project?"
            />
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
            <button type="submit" disabled={!name.trim() || saving} className="btn-primary">
              {saving ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
