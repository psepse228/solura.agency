"""Shared Supabase client, service-role key — backend only, never expose to frontend."""
from functools import lru_cache

from supabase import Client, create_client

from app.config import settings


@lru_cache
def get_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — see .env.example")
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
