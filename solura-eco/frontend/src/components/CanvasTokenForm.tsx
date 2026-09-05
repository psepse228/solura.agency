// solura-eco/frontend/src/components/CanvasTokenForm.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CanvasTokenForm() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token.trim() || saving) return;

    setSaving(true);
    setError(null);

    const res = await fetch("/api/canvas/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token.trim() }),
    });
    setSaving(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Could not verify this token");
      return;
    }

    setToken("");
    router.refresh();
  }

  return (
    <div className="mx-auto mt-6 max-w-md rounded-2xl border border-border bg-bg2 p-6">
      <h2 className="font-display text-lg font-bold text-white">Connect Canvas</h2>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-silver">
        Paste a Canvas personal access token to see your own assignments here. Generate one at{" "}
        <a
          href="https://webster.instructure.com/profile/settings"
          target="_blank"
          className="text-cyan hover:underline"
        >
          Account → Settings → New Access Token
        </a>
        .
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2">
        <input
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Canvas access token"
          className="rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-white placeholder:text-silver-dim"
        />
        <button type="submit" disabled={!token.trim() || saving} className="btn-primary self-end">
          {saving ? "Verifying…" : "Save token"}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </form>
    </div>
  );
}
