# Canvas API — notes

Webster's Canvas instance is a standard Instructure Canvas LMS deployment, so
the public [Canvas LMS REST API](https://canvas.instructure.com/doc/api/)
applies directly.

## Auth

Each member generates a personal access token:
`Canvas → Account → Settings → New Access Token`.
Token is a long-lived bearer credential with full account access — treat it
like a password. Store encrypted (see `docs/architecture.md` open question 2),
never log it, never put it in the frontend.

Requests: `Authorization: Bearer <token>` against
`https://<webster-canvas-domain>/api/v1/...`
(fill in the actual domain in `.env` once confirmed — usually
`https://webster.instructure.com` or similar; check the URL when logged in).

## Endpoints we'll actually use

- `GET /api/v1/users/self` — confirm token + get the member's Canvas user id.
- `GET /api/v1/courses?enrollment_state=active` — active courses for the
  token owner.
- `GET /api/v1/courses/:course_id/assignments?order_by=due_at` — assignments
  per course, with `due_at`, `points_possible`, `html_url`, `submission_types`.
- `GET /api/v1/courses/:course_id/assignments/:id/submissions/self` —
  submission status + score for one assignment.
- `GET /api/v1/courses?enrollment_state=active&include[]=total_scores` --
  same course list, with each course's `enrollments` array carrying
  `computed_current_score` (float, nullable) for the token owner's
  student enrollment.
- `GET /api/v1/users/self/colors` -- the member's own custom course
  colors, `{"custom_colors": {"course_<id>": "#hex", ...}}`. One call per
  sync, not per course.
- `GET /api/v1/users/self/todo` — Canvas's own "what's due" list, useful as a
  sanity check against what we compute ourselves.

## Rate limits

Canvas throttles per token (~700 req/hour typically, varies by instance).
Polling 3 members' courses/assignments every 15–30 min is nowhere near that —
no special handling needed at this scale, but don't poll per-minute.

## Gotchas to watch for

- `due_at` is `null` for assignments without a fixed due date, or when
  overridden per-section (`all_dates` / `overrides` field carries the real
  per-student date in that case) — don't assume `due_at` is always present.
- Pagination: Canvas paginates via `Link` headers, not a body field — the
  Canvas client in `backend/app/services/` needs to follow `rel="next"`.
- Timezones: Canvas returns UTC ISO8601 — convert to Tashkent time (UTC+5)
  before showing due dates or scheduling reminders.
