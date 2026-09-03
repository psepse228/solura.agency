#!/usr/bin/env python3
"""One-time backfill: real accent colors (sampled from each product's actual
code -- see the design spec's Part C table for exact sources) and github_repo
values for the projects seed_clients.py already created, plus adds Athena AI
(cano-ai-tutor) which didn't exist yet. Safe to re-run: upserts by name.
"""
from app.services.supabase_client import get_client

# name -> (github_repo, accent_start, accent_end)
PROJECT_DETAILS = {
    "Argus": ("psepse228/Argus", "#f01c52", "#c11249"),
    "Tender Agent": ("psepse228/tender-agent-app", "#38bdf8", "#818cf8"),
    "Cortège": (None, "#34d399", "#059669"),  # inferred, not sampled -- see spec Part C
    "solura-agency.com": ("psepse228/solura.agency", "#38bdf8", "#818cf8"),
}

ATHENA_AI = {
    "name": "Athena AI",
    "status": "active",
    "progress": 45,
    "github_repo": "psepse228/cano-ai-tutor",
    "accent_start": "#1e3a78",
    "accent_end": "#f5941d",
    "notes": "Formerly CANA AI Tutor. Current code branded for IHL (Interhouse Lyceum) -- colors sampled from that live branding.",
}


def main():
    db = get_client()

    for name, (github_repo, start, end) in PROJECT_DETAILS.items():
        existing = db.table("projects").select("id").eq("name", name).execute().data
        if not existing:
            print(f"skip (not found): {name}")
            continue
        project_id = existing[0]["id"]
        update = {"accent_start": start, "accent_end": end}
        if github_repo:
            update["github_repo"] = github_repo
        db.table("projects").update(update).eq("id", project_id).execute()
        print(f"updated: {name}")

    solura = db.table("clients").select("id").eq("name", "Solura").execute().data
    if not solura:
        print("ERROR: 'Solura' client not found -- run seed_clients.py first")
        return
    client_id = solura[0]["id"]

    existing_athena = (
        db.table("projects")
        .select("id")
        .eq("client_id", client_id)
        .eq("name", ATHENA_AI["name"])
        .execute()
        .data
    )
    if existing_athena:
        print("skip (already exists): Athena AI")
    else:
        db.table("projects").insert({**ATHENA_AI, "client_id": client_id}).execute()
        print("created: Athena AI")


if __name__ == "__main__":
    main()
