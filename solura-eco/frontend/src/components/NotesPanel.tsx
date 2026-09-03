// solura-eco/frontend/src/components/NotesPanel.tsx
"use client";

import { useState, type FormEvent } from "react";

type Note = { id: string; body: string; author: string; created_at: string };

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotesPanel({ projectId, initialNotes }: { projectId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || submitting) return;

    setSubmitting(true);
    const res = await fetch(`/api/projects/${projectId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    setSubmitting(false);

    if (res.ok) {
      const note = (await res.json()) as Note;
      setNotes([note, ...notes]);
      setDraft("");
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Notepad</div>

      <form onSubmit={handleSubmit} className="mb-4 flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Leave a thought, an idea, a heads-up for the others…"
          rows={2}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-[12.5px] text-white outline-none placeholder:text-silver-dim focus:border-cyan"
        />
        <button
          type="submit"
          disabled={!draft.trim() || submitting}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {submitting ? "Adding…" : "Add note"}
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No notes yet — be the first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((n) => (
            <div key={n.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-white">{n.body}</p>
              <p className="mt-1 text-[11px] text-silver-dim">
                <b className="font-medium text-silver">{n.author}</b> · {timeAgo(n.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
