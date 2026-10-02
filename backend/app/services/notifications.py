from ..config import get_settings
from .apprise_service import AppriseService
from .spotify_account_service import SpotifyPlaylistSync, get_account
from .gotify_service import GotifyService
from .ntfy_service import NtfyService
from .telegram_service import TelegramService


def configured_notifiers() -> list:
    settings = get_settings()
    notifiers = []
    if settings.gotify_url and settings.gotify_token:
        notifiers.append(GotifyService())
    if settings.ntfy_url and settings.ntfy_topic:
        notifiers.append(NtfyService())
    if settings.telegram_bot_token and settings.telegram_chat_id:
        notifiers.append(TelegramService())
    if settings.apprise_urls:
        notifiers.append(AppriseService())
    if settings.spotify_playlist_id and get_account():
        types = {t.strip() for t in settings.spotify_playlist_types.split(",") if t.strip()}
        notifiers.append(SpotifyPlaylistSync(settings.spotify_playlist_id, types))
    return notifiers


async def notify_new_releases(notifiers: list, artist_name: str, releases: list):
    for notifier in notifiers:
        await notifier.send_release_notification(artist_name, releases)
