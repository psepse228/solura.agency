"""Environment config, loaded once. See .env.example for the full list."""
import os

from dotenv import load_dotenv

load_dotenv()


class Settings:
    environment: str = os.getenv("ENVIRONMENT", "development")

    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    canvas_base_url: str = os.getenv("CANVAS_BASE_URL", "https://webster.instructure.com")

    telegram_bot_token: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    telegram_bot_username: str = os.getenv("TELEGRAM_BOT_USERNAME", "")

    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")

    frontend_url: str = os.getenv("FRONTEND_URL", "")

    session_secret: str = os.getenv("SESSION_SECRET", "")


settings = Settings()
