"""Storage path generation for uploaded documents -- avoids silently
overwriting an existing file when two uploads share the same filename
within the same project, and keeps every Storage object key ASCII-safe
regardless of what the original filename looks like.

Supabase Storage's key validation rejects non-ASCII bytes (Cyrillic,
em-dashes, etc raise a 400 InvalidKey) -- real КП/presentation filenames
routinely contain exactly that (e.g. "Argus — коммерческое предложение.html").
The human-readable filename is never lost: it's stored as-is in
documents.filename for display, this function only decides the Storage
object's own key, which nobody sees directly.
"""
import re
import secrets


def safe_stem(filename: str) -> str:
    """ASCII-only stand-in for the filename's non-extension part -- keeps
    it recognizable (alnum runs preserved) without ever touching Storage's
    key restrictions. Public (not just an internal helper) so callers can
    narrow a collision-check query to only paths that could actually
    collide, instead of fetching every document in a project."""
    stem = filename.rsplit(".", 1)[0] if "." in filename else filename
    ascii_stem = re.sub(r"[^A-Za-z0-9._-]+", "-", stem).strip("-")
    return ascii_stem or "file"


def unique_storage_path(owner_id: str, filename: str, existing_paths: set) -> str:
    """owner_id: whatever this document belongs to -- a project or a task
    (task attachments, see 0022_document_task_attachments.sql) -- just a
    folder prefix, no meaning beyond keeping different owners' uploads
    from colliding."""
    raw_ext = filename.rsplit(".", 1)[1] if "." in filename else ""
    ext = re.sub(r"[^A-Za-z0-9]+", "", raw_ext)
    stem = safe_stem(filename)
    suffix = f".{ext}" if ext else ""

    candidate = f"{owner_id}/{stem}{suffix}"
    if candidate not in existing_paths:
        return candidate

    return f"{owner_id}/{stem}-{secrets.token_hex(4)}{suffix}"
