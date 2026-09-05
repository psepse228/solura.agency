// solura-eco/frontend/src/components/GlobalSearch.tsx
// Cmd/Ctrl+K -- projects, clients, tasks, leads, and Brain pages were
// four separate silos with no way to jump straight to something by
// name. One box, debounced, backed by GET /search.
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Result = {
  type: "project" | "client" | "task" | "lead" | "brain_page";
  id: string;
  label: string;
  sub: string;
  href: string;
};

const TYPE_LABELS: Record<Result["type"], string> = {
  project: "Project",
  client: "Client",
  task: "Task",
  lead: "Lead",
  brain_page: "Brain",
};

export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    // Deferred, not a direct synchronous setState in the effect body --
    // resets the previous search's state once the dialog has actually
    // mounted open, then focuses the now-rendered input.
    const handle = setTimeout(() => {
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      inputRef.current?.focus();
    }, 0);
    return () => clearTimeout(handle);
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    const handle = setTimeout(() => {
      if (trimmed.length < 2) {
        setResults([]);
        return;
      }
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((r: Result[]) => {
          setResults(r);
          setActiveIndex(0);
        })
        .catch(() => setResults([]));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  function go(result: Result) {
    setOpen(false);
    router.push(result.href);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      go(results[activeIndex]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="row-hover flex w-full items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-left text-[12px] text-silver-dim"
      >
        <span>Search…</span>
        <kbd className="rounded border border-border px-1 py-0.5 text-[10px]">⌘K</kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[15vh]"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-bg2 shadow-xl shadow-black/40"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Search projects, clients, tasks, leads, Brain…"
              className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-white outline-none placeholder:text-silver-dim"
            />
            {results.length > 0 && (
              <div className="max-h-80 overflow-y-auto py-1.5">
                {results.map((r, i) => (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => go(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] ${
                      i === activeIndex ? "bg-white/[0.06] text-white" : "text-silver"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="shrink-0 text-[10.5px] text-silver-dim">{r.sub}</span>
                    <span className="shrink-0 rounded-full bg-bg3 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-silver-dim">
                      {TYPE_LABELS[r.type]}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {query.trim().length >= 2 && results.length === 0 && (
              <div className="px-4 py-6 text-center text-[12.5px] text-silver-dim">No results for &quot;{query}&quot;</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
