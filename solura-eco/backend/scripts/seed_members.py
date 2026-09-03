#!/usr/bin/env python3
"""One-time seed: create/update the 3 Solura Eco member logins.

Run from solura-eco/backend with the venv active:
    .venv/Scripts/python.exe scripts/seed_members.py

Prints each generated password ONCE to stdout. Copy them out to give to
Rizo/Jonik/Dior directly -- they are never written to any file.
Safe to re-run: upserts by username, regenerates password+hash each time
(so re-running rotates all 3 passwords -- intentional, not a bug).
"""
import secrets

from app.auth.passwords import hash_password
from app.services.supabase_client import get_client

MEMBERS = [
    {"username": "rizo", "full_name": "Rizo", "email": "rizo@solura.internal"},
    {"username": "jonik", "full_name": "Jonik", "email": "jonik@solura.internal"},
    {"username": "dior", "full_name": "Dior", "email": "dior@solura.internal"},
]


def main():
    db = get_client()
    print("Generated credentials (copy these out now, they will not be shown again):\n")
    for m in MEMBERS:
        password = secrets.token_urlsafe(12)
        row = {
            "username": m["username"],
            "full_name": m["full_name"],
            "email": m["email"],
            "password_hash": hash_password(password),
        }
        db.table("members").upsert(row, on_conflict="username").execute()
        print(f"  {m['username']:8s}  {password}")
    print("\nDone.")


if __name__ == "__main__":
    main()
