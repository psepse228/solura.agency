#!/usr/bin/env python3
"""One-off/manually-re-run sync: mirrors the Solura Obsidian Vault's real
pages into solura_eco.wiki_pages, so the app's Brain/Database section has
something to read. Railway/Vercel have no access to the vault's
filesystem (it lives on a local machine via Obsidian Sync, not git) --
this is the only bridge. Re-run whenever the vault changes meaningfully;
safe to re-run, upserts by path.

Usage: python scripts/sync_vault_to_db.py
"""
import glob
import os
import re
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
os.chdir(os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.supabase_client import get_client

VAULT_PATH = r"C:\Users\5pand\OneDrive\Рабочий стол\Solura brain\Solura"

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)
# Skip the vault's own special/system files -- they're navigation
# scaffolding, not real knowledge pages.
SKIP_NAMES = {"index.md", "hot.md", "log.md", "_insights.md"}


def parse_frontmatter(content: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(content)
    if not m:
        return {}, content
    raw_fm, body = m.group(1), m.group(2)
    fields: dict = {}
    for line in raw_fm.split("\n"):
        if ":" not in line or line.startswith(" ") or line.startswith("-"):
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"')
        if key == "tags":
            # e.g. "[solura, internal-tool, saas]"
            value = [t.strip() for t in value.strip("[]").split(",") if t.strip()]
        fields[key] = value
    return fields, body.strip()


def main():
    db = get_client()

    pages = []
    for path in glob.glob(os.path.join(VAULT_PATH, "**", "*.md"), recursive=True):
        filename = os.path.basename(path)
        if filename in SKIP_NAMES:
            continue

        rel_path = os.path.relpath(path, VAULT_PATH).replace("\\", "/")[:-3]  # strip .md
        with open(path, encoding="utf-8") as f:
            content = f.read()
        if not content.strip():
            continue  # skip genuinely empty pages

        fm, body = parse_frontmatter(content)
        if not body.strip():
            continue

        pages.append(
            {
                "path": rel_path,
                "title": fm.get("title") or rel_path.rsplit("/", 1)[-1],
                "category": fm.get("category"),
                "tags": fm.get("tags") or [],
                "summary": fm.get("summary"),
                "tier": fm.get("tier"),
                "lifecycle": fm.get("lifecycle"),
                "body_markdown": body,
                "wiki_updated_at": fm.get("updated") or None,
            }
        )

    for page in pages:
        db.table("wiki_pages").upsert(page, on_conflict="path").execute()
        print(f"synced: {page['path']}")

    print(f"\nDone -- {len(pages)} pages synced.")


if __name__ == "__main__":
    main()
