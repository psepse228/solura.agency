# Canvas Courses + Grades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/uni-load` gets a "Courses" section above the assignments list — each course as a card with its real Canvas color and current grade percentage, matching TD Webster's reference layout.

**Architecture:** One migration adds `courses.current_score`/`courses.color`. `CanvasClient` gets one new method (`get_course_colors`) and one param change (`include[]=total_scores` on the existing course-list call). `_sync_member` writes the two new columns during its existing course upsert. A new `GET /canvas/my-courses` endpoint mirrors `my-assignments`'s "strictly own data" shape. Frontend gets a `CourseGrid` component and the `/uni-load` page fetches+renders it above `AssignmentList`.

**Tech Stack:** Same as the original Canvas plan — FastAPI, supabase-py, httpx, Next.js 16 Server Components.

---

## File Structure

- Create: `solura-eco/supabase/migrations/0012_canvas_course_grades.sql`
- Modify: `solura-eco/backend/app/services/canvas_client.py` — add `get_course_colors`, add `include[]=total_scores` param to `list_active_courses`.
- Modify: `solura-eco/backend/app/routers/canvas.py` — `_sync_member` writes `current_score`/`color`; new `GET /my-courses`.
- Modify: `solura-eco/docs/canvas-api-notes.md` — document the two new endpoints used.
- Create: `solura-eco/frontend/src/components/CourseGrid.tsx`
- Modify: `solura-eco/frontend/src/app/(app)/uni-load/page.tsx` — fetch + render courses above assignments.

---

### Task 1: Migration — course grade + color columns

**Files:**
- Create: `solura-eco/supabase/migrations/0012_canvas_course_grades.sql`

- [ ] **Step 1: Write the migration**

Create `solura-eco/supabase/migrations/0012_canvas_course_grades.sql`:

```sql
-- Solura Eco — Canvas course grade + color, for the /uni-load Courses grid.
-- See docs/superpowers/specs/2026-09-04-canvas-courses-grades-design.md.

alter table solura_eco.courses
  add column current_score numeric,   -- e.g. 83.45; null if ungraded/hidden
  add column color text;              -- hex from the member's own Canvas
                                        -- custom_colors, e.g. '#824797';
                                        -- null if never set
```

- [ ] **Step 2: Apply the migration**

Run (from `solura-eco`, using the reusable migration script):
```bash
py scripts/apply_migration.py supabase/migrations/0012_canvas_course_grades.sql
```
Expected: the script reports the migration applied successfully (no SQL
errors). This requires `SUPABASE_DB_HOST`/`SUPABASE_DB_PASSWORD` env vars
to be set in the shell — check `scripts/apply_migration.py`'s own
docstring/usage if these aren't already exported in your environment.

- [ ] **Step 3: Verify the columns exist**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -c "
from app.services.supabase_client import get_client
db = get_client()
row = db.table('courses').select('current_score,color').limit(1).execute()
print('columns queryable, no error')
"
```
Expected: `columns queryable, no error` (an empty result set is fine —
this just confirms the columns exist and are selectable, not that any row
has data yet).

- [ ] **Step 4: Commit**

```bash
git add solura-eco/supabase/migrations/0012_canvas_course_grades.sql
git commit -m "canvas: migration for course current_score + color"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 2: CanvasClient — grades + colors

**Files:**
- Modify: `solura-eco/backend/app/services/canvas_client.py`
- Modify: `solura-eco/docs/canvas-api-notes.md`

No unit test this task — same reasoning as the original Canvas plan,
`CanvasClient` is thin HTTP plumbing, verified manually later.

- [ ] **Step 1: Add `include[]=total_scores` to the course list call**

In `solura-eco/backend/app/services/canvas_client.py`, replace the
`list_active_courses` method:

```python
    async def list_active_courses(self) -> list[dict]:
        return await self._get_paginated(
            "/api/v1/courses", params={"enrollment_state": "active"}
        )
```

with:

```python
    async def list_active_courses(self) -> list[dict]:
        # include[]=total_scores adds a per-course "enrollments" array with
        # computed_current_score for the token owner's own student
        # enrollment -- that's the grade percentage the /uni-load Courses
        # grid shows.
        return await self._get_paginated(
            "/api/v1/courses",
            params={"enrollment_state": "active", "include[]": "total_scores"},
        )
```

- [ ] **Step 2: Add `get_course_colors`**

In `solura-eco/backend/app/services/canvas_client.py`, after
`get_submission` (end of file), add:

```python

    async def get_course_colors(self) -> dict[str, str]:
        """The token owner's own custom course colors, as Canvas's own
        `{"course_<id>": "#hex", ...}` shape -- these are the colors the
        member picked in their own Canvas dashboard, used as-is rather
        than inventing our own so the /uni-load grid matches what Canvas
        itself shows them."""
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            resp = await client.get(f"{self.base_url}/api/v1/users/self/colors")
            resp.raise_for_status()
            return resp.json().get("custom_colors", {})
```

- [ ] **Step 3: Document both in canvas-api-notes.md**

In `solura-eco/docs/canvas-api-notes.md`, under the existing "## Endpoints
we'll actually use" section, after the `submissions/self` line, add:

```markdown
- `GET /api/v1/courses?enrollment_state=active&include[]=total_scores` --
  same course list, with each course's `enrollments` array carrying
  `computed_current_score` (float, nullable) for the token owner's
  student enrollment.
- `GET /api/v1/users/self/colors` -- the member's own custom course
  colors, `{"custom_colors": {"course_<id>": "#hex", ...}}`. One call per
  sync, not per course.
```

- [ ] **Step 4: Verify the app still imports cleanly**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/backend/app/services/canvas_client.py solura-eco/docs/canvas-api-notes.md
git commit -m "canvas: CanvasClient support for course grades and colors"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 3: Sync writes grade + color, new my-courses endpoint

**Files:**
- Modify: `solura-eco/backend/app/routers/canvas.py`

No unit test this task -- integration-level router code, same reasoning
as the original Canvas plan's Task 4, verified manually in Task 5.

- [ ] **Step 1: Update `_sync_member` to fetch colors once and write both new columns**

In `solura-eco/backend/app/routers/canvas.py`, replace the `_sync_member`
function's body from its start through the `canvas_courses = ...` line:

```python
async def _sync_member(db, member: dict) -> None:
    key = settings.canvas_token_encryption_key.encode()
    token = decrypt_token(_bytea_to_bytes(member["canvas_api_token_enc"]), key)
    base_url = member.get("canvas_base_url") or settings.canvas_base_url
    client = CanvasClient(base_url, token)
    now_iso = datetime.now(timezone.utc).isoformat()

    canvas_courses = await client.list_active_courses()
```

with:

```python
async def _sync_member(db, member: dict) -> None:
    key = settings.canvas_token_encryption_key.encode()
    token = decrypt_token(_bytea_to_bytes(member["canvas_api_token_enc"]), key)
    base_url = member.get("canvas_base_url") or settings.canvas_base_url
    client = CanvasClient(base_url, token)
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        colors = await client.get_course_colors()
    except Exception:
        # One member's colors call failing (rare -- it's the same token
        # that just succeeded or is about to succeed on courses/
        # assignments) shouldn't block their course/assignment sync --
        # every course just gets color: null for this run.
        logger.warning("Canvas: could not fetch course colors for member %s", member["id"])
        colors = {}

    canvas_courses = await client.list_active_courses()
```

Then, within the `for cc in canvas_courses:` loop, replace the
`course_row = (...)` upsert block:

```python
        term = cc.get("term")
        course_row = (
            db.table("courses")
            .upsert(
                {
                    "member_id": member["id"],
                    "canvas_course_id": cc["id"],
                    "name": cc.get("name") or "Untitled course",
                    "course_code": cc.get("course_code"),
                    "term": term.get("name") if term else None,
                    "start_at": cc.get("start_at"),
                    "end_at": cc.get("end_at"),
                    "synced_at": now_iso,
                },
                on_conflict="member_id,canvas_course_id",
            )
            .execute()
            .data[0]
        )
```

with:

```python
        term = cc.get("term")

        current_score = None
        for enrollment in cc.get("enrollments") or []:
            # Canvas's own docs/instances aren't fully consistent on
            # whether this embedded (course-list) enrollment's "type" is
            # the short form ("student") or the full enrollment class name
            # ("StudentEnrollment") -- substring-match, case-insensitively,
            # rather than risk an exact-match that silently leaves every
            # grade null on the instance that uses the other form.
            if "student" in str(enrollment.get("type", "")).lower():
                current_score = enrollment.get("computed_current_score")
                break

        course_row = (
            db.table("courses")
            .upsert(
                {
                    "member_id": member["id"],
                    "canvas_course_id": cc["id"],
                    "name": cc.get("name") or "Untitled course",
                    "course_code": cc.get("course_code"),
                    "term": term.get("name") if term else None,
                    "start_at": cc.get("start_at"),
                    "end_at": cc.get("end_at"),
                    "current_score": current_score,
                    "color": colors.get(f"course_{cc['id']}"),
                    "synced_at": now_iso,
                },
                on_conflict="member_id,canvas_course_id",
            )
            .execute()
            .data[0]
        )
```

- [ ] **Step 2: Add `GET /my-courses`**

In `solura-eco/backend/app/routers/canvas.py`, after the `my_assignments`
function (before `def _verify_sync_secret`), add:

```python
@router.get("/my-courses")
async def my_courses(session: dict = Depends(require_session)):
    """Strictly the calling member's own synced courses -- same
    own-data-only rule as my_assignments."""
    db = get_client()
    courses = (
        db.table("courses")
        .select("id,name,course_code,current_score,color")
        .eq("member_id", session["member_id"])
        .order("name")
        .execute()
        .data
    )
    return courses
```

- [ ] **Step 3: Verify the app still imports cleanly**

Run (from `solura-eco/backend`):
```bash
.venv/Scripts/python.exe -c "from app.main import app; print('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Commit**

```bash
git add solura-eco/backend/app/routers/canvas.py
git commit -m "canvas: sync course grades/colors, add GET /canvas/my-courses"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 4: Frontend — CourseGrid + wire into /uni-load

**Files:**
- Create: `solura-eco/frontend/src/components/CourseGrid.tsx`
- Modify: `solura-eco/frontend/src/app/(app)/uni-load/page.tsx`

- [ ] **Step 1: Create the course grid component**

Create `solura-eco/frontend/src/components/CourseGrid.tsx`:

```typescript
// solura-eco/frontend/src/components/CourseGrid.tsx
type Course = {
  id: string;
  name: string;
  course_code: string | null;
  current_score: number | null;
  color: string | null;
};

const FALLBACK_COLOR = "#3a4152"; // neutral band when no Canvas color is set

export function CourseGrid({ courses }: { courses: Course[] }) {
  if (courses.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">Courses</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {courses.map((c) => (
          <div key={c.id} className="overflow-hidden rounded-2xl border border-border bg-bg2">
            <div
              className="flex items-start px-3 py-2"
              style={{ backgroundColor: c.color ?? FALLBACK_COLOR }}
            >
              <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-bold text-white">
                {c.current_score === null ? "N/A" : `${Math.round(c.current_score)}%`}
              </span>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-[13.5px] font-semibold text-white">{c.course_code ?? c.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-silver-dim">{c.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fetch courses and render above the assignment list**

In `solura-eco/frontend/src/app/(app)/uni-load/page.tsx`, replace the
whole file with:

```typescript
// solura-eco/frontend/src/app/(app)/uni-load/page.tsx
import { cookies } from "next/headers";

import { AssignmentList } from "@/components/AssignmentList";
import { CanvasTokenForm } from "@/components/CanvasTokenForm";
import { CourseGrid } from "@/components/CourseGrid";

type Assignment = {
  id: string;
  name: string;
  course_name: string | null;
  due_at: string | null;
  html_url: string | null;
  status: string;
};
type MyAssignmentsResponse = { has_token: boolean; assignments: Assignment[] };
type Course = {
  id: string;
  name: string;
  course_code: string | null;
  current_score: number | null;
  color: string | null;
};

async function getMyAssignments(token: string | undefined): Promise<MyAssignmentsResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return { has_token: false, assignments: [] };
  const res = await fetch(`${apiUrl}/canvas/my-assignments`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { has_token: false, assignments: [] };
  return (await res.json()) as MyAssignmentsResponse;
}

async function getMyCourses(token: string | undefined): Promise<Course[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return [];
  const res = await fetch(`${apiUrl}/canvas/my-courses`, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return [];
  return (await res.json()) as Course[];
}

export default async function UniLoadPage() {
  const token = (await cookies()).get("session")?.value;
  const [{ has_token, assignments }, courses] = await Promise.all([
    getMyAssignments(token),
    getMyCourses(token),
  ]);

  return (
    <div className="px-8 py-8 animate-fade-in-up">
      <h1 className="mb-5 font-display text-2xl font-extrabold tracking-tight text-white">Uni load</h1>

      {!has_token ? (
        <CanvasTokenForm />
      ) : (
        <>
          <CourseGrid courses={courses} />
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-silver-dim">
            Upcoming Assignments
          </div>
          <AssignmentList assignments={assignments} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run (from `solura-eco/frontend`):
```bash
npx tsc --noEmit
```
Expected: no output, no errors.

- [ ] **Step 4: Commit**

```bash
git add solura-eco/frontend/src/components/CourseGrid.tsx solura-eco/frontend/src/app/(app)/uni-load/page.tsx
git commit -m "canvas: Courses grid on /uni-load, above the assignment list"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

### Task 5: Deploy + real verification (orchestrator only, not a subagent task)

- [ ] **Step 1: Push, wait for Railway/Vercel auto-deploy, confirm health**

```bash
curl -s https://backend-production-7694a.up.railway.app/health
```
Expected: `{"status":"ok"}`.

- [ ] **Step 2: Trigger a manual sync (don't wait for the 30-minute schedule)**

Using the existing `CANVAS_SYNC_SECRET` (already set on Railway), POST to
`/canvas/sync` with the `x-canvas-sync-secret` header, same as the
original Canvas plan's verification step.

- [ ] **Step 3: Confirm real data**

Load `/uni-load` for a member with a token already saved and confirm: the
Courses grid shows real course names/codes, real grade percentages (or
"N/A" where ungraded) matching what that member's real Canvas account
shows, and real colors (or the neutral fallback) matching their Canvas
dashboard.

- [ ] **Step 4: Update the build plan**

In `solura-eco/docs/build-plan.md`'s item #4 section, add a short note
that Courses+grades landed, in the same style as the existing bullets.

- [ ] **Step 5: Commit**

```bash
git add solura-eco/docs/build-plan.md
git commit -m "docs: note Canvas courses+grades shipped"
```

(Append `\n\nCo-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` to the commit message.)

---

## Self-Review Notes

- **Spec coverage:** migration for `current_score`/`color` (Task 1) ✓;
  `include[]=total_scores` + `get_course_colors` (Task 2) ✓; sync writes
  both new columns, one colors call per member per run not per course
  (Task 3) ✓; `GET /canvas/my-courses` strictly own data (Task 3) ✓;
  Courses grid above assignments, real color/fallback, "N/A" for null
  score (Task 4) ✓; error handling -- colors call failing doesn't block
  course/assignment sync (Task 3's try/except) ✓; ghost-writing button
  replacement -- confirmed `AssignmentList` already links via `html_url`,
  no code change needed there (spec explicitly calls this out, nothing to
  do in this plan).
- **Type consistency:** `Course` type shape (`id`, `name`, `course_code`,
  `current_score`, `color`) matches exactly between `CourseGrid.tsx` and
  `page.tsx`, and matches the backend's `GET /my-courses` select columns
  field-for-field.
- **`current_grade` (letter grade) deliberately not implemented** — spec
  explicitly says only `current_score` is stored, to avoid a second source
  of truth. Confirmed no task references a `current_grade` column.
