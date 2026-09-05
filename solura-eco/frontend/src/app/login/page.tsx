// solura-eco/frontend/src/app/login/page.tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Invalid username or password.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-bg px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-bg2 p-8"
      >
        <h1 className="font-display text-2xl font-bold text-white">Solura Eco</h1>
        <p className="mt-1 text-sm text-silver">Sign in to continue.</p>

        <label className="mt-6 block text-sm text-silver">
          Username
          <input
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-white outline-none focus:border-cyan"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="mt-4 block text-sm text-silver">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-3 py-2 text-white outline-none focus:border-cyan"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-[image:var(--grad)] px-4 py-2 font-display font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
