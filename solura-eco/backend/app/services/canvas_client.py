"""Canvas LMS API client. See docs/canvas-api-notes.md for endpoint notes,
pagination, and rate-limit behavior. Used by app/routers/canvas.py for both
token verification (get_self) and the sync job (courses, assignments,
submissions).
"""
import httpx


class CanvasClient:
    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url.rstrip("/")
        self._headers = {"Authorization": f"Bearer {api_token}"}

    async def _get_paginated(self, path: str, params: dict | None = None) -> list[dict]:
        """Follow Canvas's Link-header pagination until exhausted."""
        results: list[dict] = []
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            while url:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                results.extend(resp.json())
                params = None  # only needed on the first request; `next` link carries the rest
                url = resp.links.get("next", {}).get("url")
        return results

    async def get_self(self) -> dict:
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            resp = await client.get(f"{self.base_url}/api/v1/users/self")
            resp.raise_for_status()
            return resp.json()

    async def list_active_courses(self) -> list[dict]:
        # include[]=total_scores adds a per-course "enrollments" array with
        # computed_current_score for the token owner's own student
        # enrollment -- that's the grade percentage the /uni-load Courses
        # grid shows.
        return await self._get_paginated(
            "/api/v1/courses",
            params={"enrollment_state": "active", "include[]": "total_scores"},
        )

    async def list_assignments(self, course_id: int) -> list[dict]:
        return await self._get_paginated(
            f"/api/v1/courses/{course_id}/assignments", params={"order_by": "due_at"}
        )

    async def get_submission(self, course_id: int, assignment_id: int) -> dict:
        """The calling token owner's own submission for one assignment --
        `/submissions/self` is Canvas's shortcut for "whoever this token
        belongs to", no separate user-id lookup needed."""
        async with httpx.AsyncClient(headers=self._headers, timeout=30) as client:
            resp = await client.get(
                f"{self.base_url}/api/v1/courses/{course_id}/assignments/{assignment_id}/submissions/self"
            )
            resp.raise_for_status()
            return resp.json()

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
