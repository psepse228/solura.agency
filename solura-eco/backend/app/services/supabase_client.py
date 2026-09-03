"""Shared Supabase client, service-role key — backend only, never expose to frontend.

This project's Supabase instance is shared with cana-ai-tutor, so every query
is scoped to the solura_eco schema (see supabase/migrations/0001_init.sql) —
never touches `public`, where cana-ai-tutor's tables live.
"""
from functools import lru_cache

from supabase import Client, create_client

from app.config import settings

SCHEMA = "solura_eco"


@lru_cache
def get_client() -> Client:
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — see .env.example")
    client = create_client(settings.supabase_url, settings.supabase_service_role_key)
    return client.schema(SCHEMA)
