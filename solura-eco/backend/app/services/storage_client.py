"""Supabase Storage client for the "project-docs" bucket. Separate from
supabase_client.py (which is schema-scoped to solura_eco Postgres tables
via PostgREST) -- Storage is a different API surface entirely, needs the
raw (non-schema-scoped) client.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.config import settings

BUCKET = "project-docs"


@lru_cache
def _raw_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set -- see .env.example")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)


def get_storage():
    return _raw_client().storage.from_(BUCKET)
