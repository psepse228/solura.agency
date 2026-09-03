#!/usr/bin/env python3
"""One-time seed: real client/project rows for the home screen, sourced
from the Solura wiki as of 2026-09-03 (see the design spec's Seed Data
section for the reasoning behind each status/progress/client mapping).
Safe to re-run: upserts by (client name -> project name), doesn't duplicate.
"""
from app.services.supabase_client import get_client

CLIENTS = [
    {
        "name": "Ulkan Development",
        "status": "active",
        "projects": [
            {
                "name": "Argus",
                "status": "active",
                "progress": 60,
                "notes": "Pilot shipped; now expanding to a full Macro CRM replacement (per the wiki's 2026-08-01 update).",
            },
        ],
    },
    {
        "name": "Solura",
        "status": "active",
        "projects": [
            {
                "name": "Tender Agent",
                "status": "active",
                "progress": 80,
                "notes": "Solura's flagship multi-tenant SaaS product, live in production.",
            },
            {
                "name": "Cortège",
                "status": "active",
                "progress": 70,
                "notes": "Multi-tenant SaaS for wedding venues, live in production. No confirmed real venue client yet.",
            },
            {
                "name": "solura-agency.com",
                "status": "completed",
                "progress": 100,
                "github_repo": "psepse228/solura.agency",
                "notes": "This marketing site.",
            },
        ],
    },
]


def main():
    db = get_client()

    for client in CLIENTS:
        existing = db.table("clients").select("id").eq("name", client["name"]).execute().data
        if existing:
            client_id = existing[0]["id"]
        else:
            row = db.table("clients").insert(
                {"name": client["name"], "status": client["status"]}
            ).execute().data[0]
            client_id = row["id"]

        for project in client["projects"]:
            existing_project = (
                db.table("projects")
                .select("id")
                .eq("client_id", client_id)
                .eq("name", project["name"])
                .execute()
                .data
            )
            if existing_project:
                print(f"skip (already exists): {client['name']} / {project['name']}")
                continue

            data = {**project, "client_id": client_id}
            db.table("projects").insert(data).execute()
            print(f"created: {client['name']} / {project['name']}")


if __name__ == "__main__":
    main()
