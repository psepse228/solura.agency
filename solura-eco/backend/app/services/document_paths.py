"""Storage path generation for uploaded documents -- avoids silently
overwriting an existing file when two uploads share the same filename
within the same project.
"""
import secrets


def unique_storage_path(project_id: str, filename: str, existing_paths: set) -> str:
    candidate = f"{project_id}/{filename}"
    if candidate not in existing_paths:
        return candidate

    if "." in filename:
        name, ext = filename.rsplit(".", 1)
        suffixed = f"{name}-{secrets.token_hex(4)}.{ext}"
    else:
        suffixed = f"{filename}-{secrets.token_hex(4)}"

    return f"{project_id}/{suffixed}"
