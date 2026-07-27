from pydantic_settings import BaseSettings
from functools import lru_cache
from .settings_store import load_overrides


class Settings(BaseSettings):
    app_env: str = "development"
    expose_docs: bool = True
    auth_enabled: bool = True
    app_password: str = ""
    app_secret_key: str = ""
    auth_cookie_secure: bool = False
    session_ttl_hours: int = 24
    outbound_allowlist: str = ""
    cors_origins: str = "http://localhost:3000"
    log_level: str = "INFO"

    spotify_client_id: str = ""
    spotify_client_secret: str = ""

    gotify_url: str = ""
    gotify_token: str = ""

    ntfy_url: str = ""
    ntfy_topic: str = ""
    ntfy_username: str = ""
    ntfy_password: str = ""

    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    database_url: str = "postgresql+psycopg://dropss:dropss@localhost:5424/dropss"

    lastfm_api_key: str = ""
    lastfm_username: str = ""

    jellyfin_url: str = ""
    jellyfin_api_key: str = ""

    plex_url: str = ""
    plex_token: str = ""

    navidrome_url: str = ""
    navidrome_username: str = ""
    navidrome_password: str = ""

    release_check_time: str = "09:00"
    timezone: str = "UTC"
    release_months_back: int = 3

    class Config:
        env_file = "../.env"
        env_file_encoding = 'utf-8'
        case_sensitive = False
        extra = 'ignore'


SECRET_FIELDS = {
    "spotify_client_secret", "gotify_token", "ntfy_password",
    "telegram_bot_token",
    "lastfm_api_key", "jellyfin_api_key", "plex_token",
    "navidrome_password",
}

OVERRIDABLE_FIELDS = {
    "spotify_client_id", "spotify_client_secret",
    "gotify_url", "gotify_token",
    "ntfy_url", "ntfy_topic", "ntfy_username", "ntfy_password",
    "telegram_bot_token", "telegram_chat_id",
    "lastfm_api_key", "lastfm_username",
    "jellyfin_url", "jellyfin_api_key",
    "plex_url", "plex_token",
    "navidrome_url", "navidrome_username", "navidrome_password",
    "release_check_time", "timezone", "release_months_back",
}


@lru_cache()
def get_settings() -> Settings:
    settings = Settings()
    overrides = load_overrides()

    integration_overrides = {
        field: overrides[field]
        for field in OVERRIDABLE_FIELDS
        if field in overrides and field not in SECRET_FIELDS
    }

    settings = settings.model_copy(update=integration_overrides)

    return settings
