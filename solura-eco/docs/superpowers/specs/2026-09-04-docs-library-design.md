# Docs & КП library — design

Status: approved, ready for implementation plan.
Scope: build order item #3 (Internal docs library). See `../architecture.md`,
`../build-plan.md`.
Explicitly out of scope: document generation (auto-filling a КП/
presentation template for a client) — a meaningfully bigger feature,
deliberately deferred to its own separate brainstorm once storage ships.
Also out of scope: a cross-project "browse all docs" page (the sidebar's
"Docs & КП" link stays inert) — not needed to make this useful, since docs
are reachable via their project.

## Why

Solura sends real КП (commercial proposals) and presentations per client,
today scattered wherever they were made (local files, chat attachments).
This gives them one findable place, attached to the project they're for.

## Storage

A private Supabase Storage bucket, `project-docs`, in the same Supabase
project everything else already lives in — no new service, no new
credentials, the backend's existing service-role key already has bucket
access. Objects are keyed `project-docs/{project_id}/{filename}`, one
folder per project. Private (not public): every download goes through a
short-lived signed URL the backend requests on demand, never a permanent
public link.

## Data model

```sql
create table solura_eco.documents (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references solura_eco.projects(id) on delete cascade,
  doc_type      text not null check (doc_type in ('kp', 'presentation', 'other')),
  filename      text not null,
  storage_path  text not null,       -- 'project-docs/{project_id}/{filename}'
  size_bytes    bigint not null,
  uploaded_by   uuid references solura_eco.members(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index documents_project_id_idx on solura_eco.documents(project_id, created_at desc);
```

No versioning in v1 — re-uploading the same logical document creates a new
row; nothing overwrites or supersedes an older one automatically. If two
files land with the identical `filename` for the same project, the storage
path collides — handled by suffixing the stored filename with a short
random token if a collision is detected (the *displayed* `filename` stays
the original, only `storage_path` gets suffixed), so uploads never
silently overwrite each other's actual file content.

## API

- **`POST /projects/{id}/documents`** — multipart upload, fields `file` +
  `doc_type`. Validates: file present, `doc_type` is one of the 3 allowed
  values, size ≤ 25MB, content type is one of PDF/PPTX/DOCX/XLSX/PNG/JPEG.
  Uploads to Storage first, then inserts the `documents` row — if the DB
  insert fails after a successful Storage upload, the orphaned Storage
  object is deleted (no silent orphan files accumulating). `uploaded_by` is
  the session's own `member_id`, never client-supplied.
- **`GET /projects/{id}/documents`** — list for a project, newest first,
  each row includes `uploaded_by`'s name (joined).
- **`GET /documents/{id}/download`** — returns `{url: <signed URL>}`,
  short expiry (e.g. 5 minutes) — the frontend redirects the browser to it,
  doesn't proxy the file bytes through the Next.js backend.
- **`DELETE /documents/{id}`** — removes the Storage object AND the DB row.
  If the Storage delete fails, the DB row is NOT deleted (fail closed —
  better an orphaned-but-harmless file than a DB row pointing at nothing).

All four session-protected, flat access, matching every other endpoint in
this app.

## Frontend

A new "Documents" panel on the project detail page (same panel pattern as
Roles/Notepad — `rounded-2xl border border-border bg-bg2 p-5`): an upload
control (file picker + a `doc_type` select), then a list of existing
documents — filename, type badge, uploader, relative date, a download
link (hits `/documents/{id}/download`, gets the signed URL, navigates to
it) and a delete button (confirms before deleting, since it's destructive
and unversioned).

## Error handling

- Upload: file too large → `413` with a clear message ("Max 25MB").
  Wrong file type → `400` listing allowed types. No file field → `400`.
- Download: unknown `id` → `404`. Signed URL generation failure (Storage
  outage) → `502` with a generic "couldn't generate a download link, try
  again" — not a raw Storage SDK error surfaced to the user.
- Delete: unknown `id` → `404`.

## Testing

- Backend: filename-collision suffixing logic (given an existing
  `storage_path`, generating a new one doesn't collide) — the one piece of
  real logic worth a unit test, same reasoning as `_compute_stats` in the
  projects spec.
- Manual: real upload of an actual КП/presentation file, confirm it lands
  in Supabase Storage AND the `documents` table, confirm download works,
  confirm delete removes both.
- No frontend test suite exists yet (matches every prior item) — manual
  verification of the upload/list/download/delete flow.
