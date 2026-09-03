# Docs & КП Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload, list, download, and delete КП/presentation files per project — a private Supabase Storage bucket + a `documents` table + a panel on the project detail page.

**Architecture:** A new `documents` table tracks metadata (filename, type, uploader, size); the actual bytes live in the already-created private `project-docs` Supabase Storage bucket, keyed `{project_id}/{filename}`. Downloads go through short-lived signed URLs, never permanent public links. A new `app/routers/documents.py` owns all 4 endpoints (two project-scoped, two document-scoped) since they don't fit cleanly into `clients.py` or `projects.py`'s existing responsibilities.

**Tech Stack:** FastAPI + supabase-py (backend, unchanged) + Supabase Storage (new — same project, same service-role key, no new credentials), Next.js 16 (frontend, unchanged).

---

## Task 1: Migration — `documents` table

**Files:**
- Create: `solura-eco/supabase/migrations/0009_documents.sql`

- [ ] **Step 1: Write it**

```sql
-- Solura Eco — documents: КП/presentation files per project. The bytes
-- live in the private Supabase Storage bucket "project-docs" (already
-- created), keyed "{project_id}/{filename}" -- this table is metadata
-- only. No versioning: a re-upload is a new row, nothing overwrites an
-- older one automatically (see app/services/document_paths.py for how
-- filename collisions are handled without silently clobbering a file).

create table solura_eco.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  doc_type      text not null check (doc_type in ('kp', 'presentation', 'other')),
  filename      text not null,
  storage_path  text not null,
  size_bytes    bigint not null,
  uploaded_by   uuid references solura_eco.members(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index documents_project_id_idx on solura_eco.documents(project_id, created_at desc);

alter table solura_eco.documents enable row level security;
-- RLS: no policies yet, same as every other table -- service role bypasses.
```

- [ ] **Step 2: Apply it**

Run (with `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` exported in your shell, not written to any file):

```bash
cd solura-eco
python scripts/apply_migration.py supabase/migrations/0009_documents.sql
```

- [ ] **Step 3: Commit**

```bash
git add solura-eco/supabase/migrations/0009_documents.sql
git commit -m "Solura Eco: migration for documents table"
```

## Task 2: Add `python-multipart` (required for FastAPI file uploads)

**Files:**
- Modify: `solura-eco/backend/requirements.txt`

- [ ] **Step 1: Add it**

Append to `solura-eco/backend/requirements.txt`:

```text
python-multipart==0.0.12
```

- [ ] **Step 2: Install**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pip install -r requirements.txt`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/requirements.txt
git commit -m "Solura Eco: add python-multipart for file uploads"
```

## Task 3: Filename-collision path generation (TDD)

**Files:**
- Create: `solura-eco/backend/app/services/document_paths.py`
- Create: `solura-eco/backend/tests/services/__init__.py` (empty)
- Test: `solura-eco/backend/tests/services/test_document_paths.py`

- [ ] **Step 1: Write the failing test**

```python
# solura-eco/backend/tests/services/test_document_paths.py
from app.services.document_paths import unique_storage_path


def test_returns_simple_path_when_no_collision():
    result = unique_storage_path("proj-1", "proposal.pdf", set())
    assert result == "proj-1/proposal.pdf"


def test_suffixes_filename_on_collision_keeping_extension():
    existing = {"proj-1/proposal.pdf"}
    result = unique_storage_path("proj-1", "proposal.pdf", existing)
    assert result != "proj-1/proposal.pdf"
    assert result.startswith("proj-1/proposal-")
    assert result.endswith(".pdf")


def test_suffixes_filename_without_extension_on_collision():
    existing = {"proj-1/README"}
    result = unique_storage_path("proj-1", "README", existing)
    assert result != "proj-1/README"
    assert result.startswith("proj-1/README-")


def test_different_projects_never_collide_on_the_same_filename():
    existing = {"proj-1/proposal.pdf"}
    result = unique_storage_path("proj-2", "proposal.pdf", existing)
    assert result == "proj-2/proposal.pdf"
```

- [ ] **Step 2: Run it, confirm ModuleNotFoundError**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/services/test_document_paths.py -v`

- [ ] **Step 3: Implement**

```python
# solura-eco/backend/app/services/document_paths.py
"""Storage path generation for uploaded documents -- avoids silently
overwriting an existing file when two uploads share the same filename
within the same project.
"""
import secrets


def unique_storage_path(project_id: str, filename: str, existing_paths: set) -> str:
    candidate = f"{project_id}/{filename}"
    if candidate not in existing_paths:
        return candidate

    if "." in filename:
        name, ext = filename.rsplit(".", 1)
        suffixed = f"{name}-{secrets.token_hex(4)}.{ext}"
    else:
        suffixed = f"{filename}-{secrets.token_hex(4)}"

    return f"{project_id}/{suffixed}"
```

- [ ] **Step 4: Run it, confirm 4 passed**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -m pytest tests/services/test_document_paths.py -v`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/services/document_paths.py solura-eco/backend/tests/services/
git commit -m "Solura Eco: filename-collision-safe storage paths + tests"
```

## Task 4: Storage client

**Files:**
- Create: `solura-eco/backend/app/services/storage_client.py`

- [ ] **Step 1: Write it**

```python
# solura-eco/backend/app/services/storage_client.py
"""Supabase Storage client for the "project-docs" bucket. Separate from
supabase_client.py (which is schema-scoped to solura_eco Postgres tables
via PostgREST) -- Storage is a different API surface entirely, needs the
raw (non-schema-scoped) client.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.config import settings

BUCKET = "project-docs"


@lru_cache
def _raw_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set -- see .env.example")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_storage():
    return _raw_client().storage.from_(BUCKET)
```

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd solura-eco/backend && .venv/Scripts/python.exe -c "from app.services.storage_client import get_storage; print('OK')"`

- [ ] **Step 3: Commit**

```bash
git add solura-eco/backend/app/services/storage_client.py
git commit -m "Solura Eco: Supabase Storage client for project-docs bucket"
```

## Task 5: Documents API (upload, list, download, delete)

**Files:**
- Create: `solura-eco/backend/app/routers/documents.py`
- Modify: `solura-eco/backend/app/main.py`

- [ ] **Step 1: Write the router**

```python
# solura-eco/backend/app/routers/documents.py
"""Documents API -- upload/list/download/delete for the project-scoped
docs library. Not part of projects.py or clients.py: this owns both
project-scoped paths (POST/GET .../documents) and document-scoped paths
(download/delete by document id), which don't fit either existing
router's prefix cleanly -- so it declares full paths and mounts with no
prefix of its own (see main.py).
"""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.auth.deps import require_session
from app.services.document_paths import unique_storage_path
from app.services.storage_client import get_storage
from app.services.supabase_client import get_client

router = APIRouter()

ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",  # .pptx
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
    "image/png",
    "image/jpeg",
}
MAX_SIZE_BYTES = 25 * 1024 * 1024
ALLOWED_DOC_TYPES = ("kp", "presentation", "other")


@router.post("/projects/{project_id}/documents")
async def upload_document(
    project_id: str,
    file: UploadFile = File(...),
    doc_type: str = Form(...),
    session: dict = Depends(require_session),
):
    if doc_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(status_code=400, detail=f"doc_type must be one of: {', '.join(ALLOWED_DOC_TYPES)}")

    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Allowed: PDF, PPTX, DOCX, XLSX, PNG, JPEG",
        )

    body = await file.read()
    if len(body) > MAX_SIZE_BYTES:
        raise HTTPException(status_code=413, detail="Max file size is 25MB")

    db = get_client()
    existing = (
        db.table("documents")
        .select("storage_path")
        .eq("project_id", project_id)
        .execute()
        .data
    )
    existing_paths = {d["storage_path"] for d in existing}
    storage_path = unique_storage_path(project_id, file.filename, existing_paths)

    storage = get_storage()
    storage.upload(storage_path, body, {"content-type": file.content_type})

    try:
        row = {
            "project_id": project_id,
            "doc_type": doc_type,
            "filename": file.filename,
            "storage_path": storage_path,
            "size_bytes": len(body),
            "uploaded_by": session["member_id"],
        }
        result = db.table("documents").insert(row).execute().data[0]
    except Exception:
        # Don't leave an orphaned Storage object if the DB insert fails.
        storage.remove([storage_path])
        raise HTTPException(status_code=500, detail="Failed to save document record")

    member = db.table("members").select("full_name").eq("id", session["member_id"]).execute().data
    result["uploaded_by_name"] = member[0]["full_name"] if member else None
    return result


@router.get("/projects/{project_id}/documents")
async def list_documents(project_id: str, _: dict = Depends(require_session)):
    db = get_client()
    docs = (
        db.table("documents")
        .select("id,doc_type,filename,size_bytes,created_at,members(full_name)")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for d in docs:
        member = d.pop("members", None)
        d["uploaded_by_name"] = member["full_name"] if member else None
    return docs


@router.get("/documents/{document_id}/download")
async def download_document(document_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("documents").select("storage_path").eq("id", document_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path = result[0]["storage_path"]
    storage = get_storage()
    try:
        signed = storage.create_signed_url(storage_path, 300)
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't generate a download link, try again")

    return {"url": signed["signedURL"]}


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, _: dict = Depends(require_session)):
    db = get_client()
    result = db.table("documents").select("storage_path").eq("id", document_id).execute().data
    if not result:
        raise HTTPException(status_code=404, detail="Document not found")

    storage_path = result[0]["storage_path"]
    storage = get_storage()
    try:
        storage.remove([storage_path])
    except Exception:
        raise HTTPException(status_code=502, detail="Couldn't delete the file, try again")

    db.table("documents").delete().eq("id", document_id).execute()
    return {"ok": True}
```

- [ ] **Step 2: Wire it into `main.py`**

Change the import line (currently `from app.routers import auth, canvas, clients, members, projects, tasks, webhooks`) to:

```python
from app.routers import auth, canvas, clients, documents, members, projects, tasks, webhooks
```

Add the include — **no prefix** (this router declares its own full paths):

```python
app.include_router(documents.router, tags=["documents"])
```

- [ ] **Step 3: Verify the app imports and lists all 4 routes**

Run:
```bash
cd solura-eco/backend && .venv/Scripts/python.exe -c "
import app.main
paths = [r.path for r in app.main.app.routes]
for p in ['/projects/{project_id}/documents', '/documents/{document_id}/download', '/documents/{document_id}']:
    print(p, p in paths)
"
```
Expected: all three print `True` (the `/projects/{project_id}/documents` path covers both POST and GET)

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/app/routers/documents.py solura-eco/backend/app/main.py
git commit -m "Solura Eco: documents API (upload, list, download, delete)"
```

## Task 6: Manual backend verification — real upload against real Storage

**Files:** none (verification checkpoint)

- [ ] **Step 1: Start the backend locally**

Run (background): `cd solura-eco/backend && .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000`

- [ ] **Step 2: Log in and upload a real small file**

Using a real session token (same pattern as prior plans' verification tasks) and a real project id (query `GET /projects` for one), upload a small real PDF or any allowed file type via curl's multipart support:

```bash
curl -s -X POST http://localhost:8000/projects/<real-project-id>/documents \
  -H "Authorization: Bearer <token>" \
  -F "doc_type=kp" \
  -F "file=@<path-to-a-real-small-pdf-or-similar-file>"
```

Expected: JSON response with `id`, `filename`, `storage_path`, `uploaded_by_name` set to the real logged-in member's name.

- [ ] **Step 3: Confirm it's listed**

```bash
curl -s http://localhost:8000/projects/<real-project-id>/documents -H "Authorization: Bearer <token>"
```
Expected: includes the just-uploaded document.

- [ ] **Step 4: Confirm download works**

```bash
curl -s http://localhost:8000/documents/<document-id>/download -H "Authorization: Bearer <token>"
```
Expected: `{"url": "https://...signed URL..."}` — open it in a browser or `curl` it directly, confirm the real file downloads.

- [ ] **Step 5: Confirm delete removes both the row and the Storage object**

```bash
curl -s -X DELETE http://localhost:8000/documents/<document-id> -H "Authorization: Bearer <token>"
```
Then re-run Step 3's list call — the document should be gone. Stop the backend (find and kill the uvicorn process).

## Task 7: Frontend — `DocumentsPanel` client component

**Files:**
- Create: `solura-eco/frontend/src/components/DocumentsPanel.tsx`

- [ ] **Step 1: Write it**

```tsx
// solura-eco/frontend/src/components/DocumentsPanel.tsx
"use client";

import { useState, type FormEvent } from "react";

type Document = {
  id: string;
  filename: string;
  doc_type: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  kp: "КП",
  presentation: "Presentation",
  other: "Other",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentsPanel({
  projectId,
  initialDocuments,
}: {
  projectId: string;
  initialDocuments: Document[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [docType, setDocType] = useState("kp");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!file || uploading) return;

    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("doc_type", docType);

    const res = await fetch(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Upload failed");
      return;
    }

    const doc = (await res.json()) as Document;
    setDocuments([doc, ...documents]);
    setFile(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document? This can't be undone.")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments(documents.filter((d) => d.id !== id));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-bg2 p-5">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Documents</div>

      <form onSubmit={handleUpload} className="mb-4 flex flex-col gap-2">
        <div className="flex gap-2">
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs text-white"
          >
            <option value="kp" className="bg-bg2">
              КП
            </option>
            <option value="presentation" className="bg-bg2">
              Presentation
            </option>
            <option value="other" className="bg-bg2">
              Other
            </option>
          </select>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 text-xs text-silver file:mr-2 file:rounded-md file:border file:border-border file:bg-bg3 file:px-2 file:py-1 file:text-xs file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={!file || uploading}
          className="self-end rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.05] disabled:opacity-40 disabled:hover:bg-transparent"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </form>

      {documents.length === 0 ? (
        <p className="text-xs italic text-silver-dim">No documents yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((d) => (
            <div
              key={d.id}
              className="animate-fade-in-up flex items-center justify-between gap-2 rounded-lg bg-bg3 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-white">{d.filename}</span>
                  <span className="shrink-0 rounded-full bg-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-cyan">
                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                  </span>
                </div>
                <div className="mt-0.5 text-[10.5px] text-silver-dim">
                  {d.uploaded_by_name ?? "Unknown"} · {formatSize(d.size_bytes)}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={`/api/documents/${d.id}/download`} className="text-[11px] text-cyan hover:underline">
                  Download
                </a>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-[11px] text-silver-dim hover:text-red-400"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd solura-eco/frontend && npx tsc --noEmit` — only acceptable pre-existing error is the `LayoutProps` one in `layout.tsx`.

- [ ] **Step 3: Commit**

```bash
git add solura-eco/frontend/src/components/DocumentsPanel.tsx
git commit -m "Solura Eco frontend: DocumentsPanel component"
```

## Task 8: Frontend — proxy routes (upload, download-redirect, delete)

**Files:**
- Create: `solura-eco/frontend/src/app/api/projects/[id]/documents/route.ts`
- Create: `solura-eco/frontend/src/app/api/documents/[id]/download/route.ts`
- Create: `solura-eco/frontend/src/app/api/documents/[id]/route.ts`

Same reasoning as every other proxy route in this app: the browser can't attach the `Authorization: Bearer` header itself (the session token lives in an httpOnly cookie), so these forward it server-side.

- [ ] **Step 1: Upload proxy — forwards the multipart FormData body as-is**

```tsx
// solura-eco/frontend/src/app/api/projects/[id]/documents/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;
  const formData = await request.formData();

  const res = await fetch(`${apiUrl}/projects/${id}/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return NextResponse.json({ error: detail.detail ?? "Upload failed" }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
```

(Do not set a `Content-Type` header manually here — `fetch` sets the correct multipart boundary itself when given a `FormData` body. Setting it manually would break the upload.)

- [ ] **Step 2: Download proxy — redirects the browser straight to the signed URL**

```tsx
// solura-eco/frontend/src/app/api/documents/[id]/download/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;

  const res = await fetch(`${apiUrl}/documents/${id}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to get download link" }, { status: res.status });
  }

  const { url } = (await res.json()) as { url: string };
  return NextResponse.redirect(url);
}
```

- [ ] **Step 3: Delete proxy**

```tsx
// solura-eco/frontend/src/app/api/documents/[id]/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    return NextResponse.json({ error: "Backend not configured" }, { status: 500 });
  }

  const { id } = await params;
  const token = (await cookies()).get("session")?.value;

  const res = await fetch(`${apiUrl}/documents/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Delete failed" }, { status: res.status });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`, route table includes `/api/projects/[id]/documents`, `/api/documents/[id]/download`, `/api/documents/[id]`

- [ ] **Step 5: Commit**

```bash
git add solura-eco/frontend/src/app/api/projects/[id]/documents solura-eco/frontend/src/app/api/documents
git commit -m "Solura Eco frontend: document upload/download/delete proxy routes"
```

## Task 9: Wire `DocumentsPanel` into the project detail page

**Files:**
- Modify: `solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx`

- [ ] **Step 1: Add the `Document` type and a fetch function**

Add this type near the other type declarations (after `Note`):

```tsx
type Document = {
  id: string;
  filename: string;
  doc_type: string;
  size_bytes: number;
  uploaded_by_name: string | null;
  created_at: string;
};
```

Add this function next to `getProjectNotes`:

```tsx
async function getProjectDocuments(id: string, token: string | undefined): Promise<Document[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/projects/${id}/documents`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Document[];
}
```

- [ ] **Step 2: Fetch documents in parallel with project + notes**

Change:

```tsx
  const [project, notes] = await Promise.all([getProject(id, token), getProjectNotes(id, token)]);
```

to:

```tsx
  const [project, notes, documents] = await Promise.all([
    getProject(id, token),
    getProjectNotes(id, token),
    getProjectDocuments(id, token),
  ]);
```

- [ ] **Step 3: Add the import and render the panel**

Add the import alongside the existing ones:

```tsx
import { DocumentsPanel } from "@/components/DocumentsPanel";
```

Find where `<NotesPanel ... />` is rendered (in the right-hand column) and add `<DocumentsPanel>` right after it:

```tsx
          <NotesPanel projectId={project.id} initialNotes={notes ?? []} />

          <DocumentsPanel projectId={project.id} initialDocuments={documents ?? []} />
```

- [ ] **Step 4: Build to verify**

Run: `cd solura-eco/frontend && npm run build`
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add "solura-eco/frontend/src/app/(app)/projects/[id]/page.tsx"
git commit -m "Solura Eco frontend: wire DocumentsPanel into project detail page"
```

## Task 10: Deploy and end-to-end verify

**Files:** none (deployment + verification checkpoint)

- [ ] **Step 1: Push to main**

```bash
git push origin main
```

Railway and Vercel auto-deploy on push (already connected).

- [ ] **Step 2: Verify live**

Log in on `https://solura-eco.vercel.app`, open any project, upload a real small file (a real КП or presentation if one's available, otherwise any allowed test file), confirm it appears in the list with the right uploader name and size, confirm Download actually downloads the real file, confirm Delete removes it and a page refresh confirms it's gone.

- [ ] **Step 3: Update the build plan**

In `solura-eco/docs/build-plan.md`, mark item #3 (Internal docs library) as shipped, matching the format of items #1/#2. Commit:

```bash
git add solura-eco/docs/build-plan.md
git commit -m "Solura Eco: Docs & КП library shipped"
```
