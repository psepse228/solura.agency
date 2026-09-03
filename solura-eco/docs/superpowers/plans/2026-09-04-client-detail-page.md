# Client Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make client name a real link everywhere it appears (home grid tiles, project detail header), landing on a new page showing that client's status and full project grid.

**Architecture:** One new backend endpoint (`GET /clients/{id}`, reusing the existing nested-projects query shape from `list_clients`), one new frontend route (`/clients/[id]/page.tsx`, reusing the home page's project-tile rendering), and a structural fix to the home page's tile markup (it's currently one big `<Link>` — a client-name link nested inside would be invalid HTML).

**Tech Stack:** FastAPI + supabase-py (unchanged), Next.js 16 App Router (unchanged).

---

## Task 1: `GET /clients/{id}`

**Files:**
- Modify: `solura-eco/backend/app/routers/clients.py`

- [ ] **Step 1: Add the endpoint**

Add this route to `solura-eco/backend/app/routers/clients.py`, right after the existing `list_clients` function (around line 71, after its `return clients`):

```python
@router.get("/{client_id}")
async def get_client_detail(client_id: str, _: dict = Depends(require_session)):
    """One client with its projects nested -- same shape as list_clients'
    per-client entries, scoped to one client instead of all of them."""
    db = get_client()
    result = db.table("clients").select("*").eq("id", client_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Client not found")

    client = result[0]
    projects = (
        db.table("projects")
        .select("*")
        .eq("client_id", client_id)
        .order("name")
        .execute()
        .data
    )
    client["projects"] = projects
    return client
```

Note: this file already has a route `@router.patch("/{client_id}")` — a `GET` on the same path pattern doesn't conflict with a `PATCH` on it (different HTTP methods are independent routes in FastAPI), so no ordering concern here (unlike the `/stats` vs `/{project_id}` situation in `projects.py`, which was about two routes matching the same method).

- [ ] **Step 2: Verify the app imports and lists the route**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "import app.main; print('/clients/{client_id}' in [r.path for r in app.main.app.routes])"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/routers/clients.py
git commit -m "Solura Eco: GET /clients/{id}"
```

## Task 2: `/clients/[id]` page

**Files:**
- Create: `solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx`

- [ ] **Step 1: Write it**

```tsx
// solura-eco/frontend/src/app/(app)/clients/[id]/page.tsx
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ProgressBar } from "@/components/ProgressBar";

type Project = {
  id: string;
  name: string;
  status: string;
  progress: number;
  accent_start: string | null;
  accent_end: string | null;
};
type ClientDetail = {
  id: string;
  name: string;
  status: string;
  projects: Project[];
};

const DEFAULT_GRADIENT: [string, string] = ["#38bdf8", "#818cf8"];

async function getClient(id: string, token: string | undefined): Promise<ClientDetail | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;
  const res = await fetch(`${apiUrl}/clients/${id}`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Backend returned ${res.status}`);
  return (await res.json()) as ClientDetail;
}

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const client = await getClient(id, token);

  if (!client) notFound();

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <Link href="/" className="mb-5 inline-flex items-center gap-1.5 text-xs text-silver hover:text-white">
        ← All projects
      </Link>

      <div className="mb-6 flex items-center gap-3">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">{client.name}</h1>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
            client.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
          }`}
        >
          {client.status}
        </span>
      </div>

      {client.projects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-silver">
          No projects yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {client.projects.map((p) => {
            const [start, end] =
              p.accent_start && p.accent_end ? [p.accent_start, p.accent_end] : DEFAULT_GRADIENT;
            const gradient = `linear-gradient(135deg, ${start}, ${end})`;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
              >
                <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                <div className="flex items-start justify-between gap-2">
                  <div className="font-display text-base font-bold">{p.name}</div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                      p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <ProgressBar progress={p.progress} gradient={gradient} />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                    {p.progress}%
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

(This page's project tiles don't need the client-name-link structural fix from Task 3 — there's no client name shown per-tile here, since every tile on this page already belongs to the one client at the top.)

- [ ] **Step 2: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, route table includes `/clients/[id]`

- [ ] **Step 3: Commit**

```bash
git add "solura-eco/frontend/src/app/(app)/clients"
git commit -m "Solura Eco frontend: client detail page"
```

## Task 3: Wire up client-name links (home grid + project detail header)

**Files:**
- Modify: `solura-eco/frontend/src/app/(app)/page.tsx`
- Modify: `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`

### Step 1: home page — add `client_id` to the `Project` type

In `solura-eco/frontend/src/app/(app)/page.tsx`, change:

```tsx
type Project = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
```

to:

```tsx
type Project = {
  id: string;
  name: string;
  client_id: string;
  client_name: string | null;
  status: string;
```

### Step 2: home page — restructure the tile from one big `<Link>` into a `<div>` with an inset-covering `<Link>` plus a separate client-name `<Link>`

The current tile (in the `projects.map((p) => { ... })` block) is:

```tsx
                return (
                  <Link
                    key={p.id}
                    href={`/projects/${p.id}`}
                    className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-bold">{p.name}</div>
                        <div className="mt-0.5 text-xs text-silver-dim">{p.client_name ?? "—"}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                          p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar progress={p.progress} gradient={gradient} />
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex">
                        {people.map((m) => (
                          <Avatar key={m.id} member={m} />
                        ))}
                      </div>
                      <span className="text-[11px] text-silver-dim">{timeAgo(p.last_activity_at)}</span>
                    </div>
                  </Link>
                );
```

Replace it with (outer element is now `<div>`, a full-cover invisible `<Link>` handles "click anywhere on the card", the client name is its own `<Link>` sitting above that overlay via `z-10` so it's independently clickable — this avoids ever nesting one `<a>` inside another, which is invalid HTML):

```tsx
                return (
                  <div
                    key={p.id}
                    className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-border bg-bg2 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:shadow-lg hover:shadow-black/20"
                  >
                    <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundImage: gradient }} />
                    <Link href={`/projects/${p.id}`} className="absolute inset-0 z-0" aria-label={`Open ${p.name}`} />
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-base font-bold">{p.name}</div>
                        <Link
                          href={`/clients/${p.client_id}`}
                          className="relative z-10 mt-0.5 inline-block text-xs text-silver-dim hover:text-white hover:underline"
                        >
                          {p.client_name ?? "—"}
                        </Link>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${
                          p.status === "active" ? "bg-cyan/15 text-cyan" : "bg-silver/15 text-silver"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar progress={p.progress} gradient={gradient} />
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-silver">
                        {p.progress}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex">
                        {people.map((m) => (
                          <Avatar key={m.id} member={m} />
                        ))}
                      </div>
                      <span className="text-[11px] text-silver-dim">{timeAgo(p.last_activity_at)}</span>
                    </div>
                  </div>
                );
```

### Step 3: project detail page — add `client_id` to `ProjectDetail`, link the client name

In `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`, change:

```tsx
type ProjectDetail = {
  id: string;
  name: string;
  client_name: string | null;
  status: string;
```

to:

```tsx
type ProjectDetail = {
  id: string;
  name: string;
  client_id: string;
  client_name: string | null;
  status: string;
```

Then change:

```tsx
          <div className="mt-1 flex items-center gap-2 text-sm text-silver">
            <span>{project.client_name ?? "—"}</span>
```

to:

```tsx
          <div className="mt-1 flex items-center gap-2 text-sm text-silver">
            <Link href={`/clients/${project.client_id}`} className="hover:text-white hover:underline">
              {project.client_name ?? "—"}
            </Link>
```

(`Link` is already imported at the top of this file — no new import needed. No nested-link conflict here since this text isn't inside another `<Link>`.)

### Step 4: Build to verify

`cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`

### Step 5: Commit

```bash
git add "solura-eco/frontend/src/app/(app)/page.tsx" "solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx"
git commit -m "Solura Eco frontend: link client names to the new client detail page"
```

## Task 4: Manual verification + deploy

**Files:** none (verification checkpoint)

- [ ] **Step 1: Local smoke test**

Start both servers locally (backend `uvicorn app.main:app --reload` on 8000, frontend `npm run dev`), log in, confirm: clicking a client name on the home grid navigates to `/clients/{id}` and shows that client's projects; clicking a project tile elsewhere (not on the name) still navigates to the project; clicking a client name on a project detail page also navigates correctly; a client with zero projects shows the empty state.

- [ ] **Step 2: Push to main and deploy**

```bash
git push origin main
```

Railway and Vercel auto-deploy on push (already connected from prior work). Confirm via a live login on `https://solura-eco.vercel.app` that the same flows in Step 1 work in production.

- [ ] **Step 3: Update the build plan**

In `solura-eco/docs/build-plan.md`, note under item #1 that client names are now real links to a client detail page. Commit:

```bash
git add solura-eco/docs/build-plan.md
git commit -m "Solura Eco: client detail page shipped"
```
