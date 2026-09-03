# Client detail page — design

Status: approved, ready for implementation plan.
Scope: small addition to the projects-first IA (item #1) — client name
becomes a real link, not just text. See `../architecture.md`,
`../build-plan.md`.
Explicitly out of scope: Telegram Business integration (a separate,
larger port from Argus's real implementation — its own upcoming
brainstorm, item #5). This page ships without it; the Telegram thread
panel gets added here once that lands.

## Why

Client name currently shows as plain text on project tiles and the
project detail page header — no way to see "everything for this client"
in one place, or to see a client with zero projects yet (a prospect).

## API

**`GET /clients/{id}`** — single client (`id`, `name`, `status`) with its
projects nested the same shape `GET /clients` already returns per-client
(`id`, `name`, `status`, `progress`, `accent_start`, `accent_end`,
`github_repo`) — reuses the existing nested-projects query pattern already
in `clients.py`'s `list_clients`, scoped to one client via `.eq("id", ...)`
instead of returning all. 404 if the client doesn't exist. Session-protected
like everything else.

## Frontend

- **`/clients/[id]/page.tsx`** (new, inside the `(app)` route group) —
  client name + status pill at top, then a project grid using the same
  tile component/styling already on the home page (each tile still links
  to `/projects/[id]`). A client with zero projects shows the existing
  "No projects yet" empty state, reused verbatim.
- **Project grid tiles (home page)** — `client_name` becomes
  `<Link href={\`/clients/${p.client_id}\`}>` instead of plain text.
  Requires adding `client_id` to the frontend `Project` type (the backend
  already selects it, just wasn't in the type/JSX before).
- **Project detail page header** — same treatment: `client_name` becomes a
  link to `/clients/${project.client_id}`, `client_id` added to
  `ProjectDetail` type.
- **Structural fix required on the home page tile**: today the whole tile
  is one `<Link href="/projects/{id}">` wrapping everything, including the
  client name. Nesting a second `<Link>` (client name → `/clients/{id}`)
  inside it would produce nested `<a>` tags — invalid HTML, unpredictable
  click behavior. Fix: the outer tile element changes from `<Link>` to
  `<div>` (still styled identically), with the bulk of the tile's content
  wrapped in its own inner `<Link href="/projects/{id}">` for "click
  anywhere on the tile" navigation, and the client name pulled out as a
  sibling `<Link href="/clients/{id}">` alongside it — so the two links
  are siblings, never nested. The project detail page header has no such
  conflict (client name there isn't inside another link already).

## Error handling

Unknown client ID → `404` (Next.js `notFound()`, same pattern as the
project detail page).

## Testing

No new backend logic worth a unit test (this is a read query, same
shape/risk profile as the existing `GET /projects/{id}`, already covered
by that endpoint's manual verification precedent). Manual: visit a client
with projects, visit `Cortège`'s client "Solura" (already has projects),
confirm the grid renders and each tile still links correctly; click a
client name from the home grid and from a project detail page, confirm
both land on the right client page.
