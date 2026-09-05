"""Environment config, loaded once. See .env.example for the full list."""
import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    environment: str = os.getenv("ENVIRONMENT", "development")

    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    canvas_base_url: str = os.getenv("CANVAS_BASE_URL", "https://webster.instructure.com")
    canvas_token_encryption_key: str = os.getenv("CANVAS_TOKEN_ENCRYPTION_KEY", "")
    canvas_sync_secret: str = os.getenv("CANVAS_SYNC_SECRET", "")

    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_bot_username: str = os.getenv("TELEGRAM_BOT_USERNAME", "")
    telegram_webhook_secret: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    frontend_url: str = os.getenv("FRONTEND_URL", "")

    session_secret: str = os.getenv("SESSION_SECRET", "")
    github_webhook_secret: str = os.getenv("GITHUB_WEBHOOK_SECRET", "")
    vercel_webhook_secret: str = os.getenv("VERCEL_WEBHOOK_SECRET", "")
    railway_webhook_secret: str = os.getenv("RAILWAY_WEBHOOK_SECRET", "")


settings = Settings()

if settings.environment == "production" and not settings.session_secret:
    # Fail loudly at startup rather than silently signing/verifying every
    # session token with an empty-string key -- that would be a full auth
    # bypass (anyone could forge a valid token) if SESSION_SECRET is ever
    # left unset on a real deploy (e.g. a forgotten Railway env var).
    raise RuntimeError(
        "SESSION_SECRET is not set in production. Refusing to start with an "
        "empty session-signing key -- see .env.example."
    )
