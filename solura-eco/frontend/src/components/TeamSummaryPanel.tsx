// solura-eco/frontend/src/components/TeamSummaryPanel.tsx
// AI сводка -- generated on click (POST /me/summary), not polled or
// cached. Three people don't generate enough new activity per day for a
// background job to be worth the OpenAI cost every time someone opens
// the home page.
"use client";

import { useState } from "react";

type Highlight = { label: string; detail: string };
type Summary = { narrative: string; highlights: Highlight[] };

export function TeamSummaryPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/me/summary", { method: "POST" });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't generate a summary");
      return;
    }
    setSummary((await res.json()) as Summary);
  }

  return (
    <div className="panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wide text-silver-dim">Сводка</div>
        <button onClick={generate} disabled={loading} className="btn-secondary">
          {loading ? "Thinking…" : summary ? "Regenerate" : "Generate summary"}
        </button>
      </div>

      {error && <p className="text-[11px] text-red-400">{error}</p>}

      {!summary && !loading && !error && (
        <p className="text-sm text-silver">
          A live read of the whole platform — what&apos;s moving, what&apos;s stalled, what needs attention.
        </p>
      )}

      {summary && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-silver">{summary.narrative}</p>
          {summary.highlights.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {summary.highlights.map((h, i) => (
                <div key={i} className="rounded-lg bg-bg3 px-3 py-2">
                  <div className="text-[12px] font-semibold text-white">{h.label}</div>
                  <div className="text-[11.5px] text-silver-dim">{h.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
