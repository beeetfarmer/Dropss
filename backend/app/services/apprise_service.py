import logging

import apprise

from ..config import get_settings
from .ntfy_service import NtfyService

logger = logging.getLogger(__name__)


class AppriseService:
    """Fan out to any service Apprise supports (Discord, Slack, Pushover, email, ...).

    APPRISE_URLS is env-only because Apprise URLs embed their credentials.
    Multiple URLs may be separated by commas or whitespace.
    """

    def __init__(self):
        self.client = apprise.Apprise()
        urls = get_settings().apprise_urls
        if urls and not self.client.add(urls):
            logger.warning("APPRISE_URLS contains no valid Apprise URL")

    async def send_notification(self, title: str, message: str) -> bool:
        if not len(self.client):
            return False
        try:
            ok = bool(await self.client.async_notify(
                title=title,
                body=message,
                body_format=apprise.NotifyFormat.MARKDOWN,
            ))
        except Exception as e:
            logger.warning("Error sending Apprise notification: %s", type(e).__name__)
            return False
        if ok:
            logger.info("Apprise notification sent")
        else:
            logger.warning("Apprise notification failed for one or more URLs")
        return ok

    async def send_release_notification(self, artist_name: str, releases: list) -> bool:
        if not releases:
            return False
        title = f"New Release{'s' if len(releases) > 1 else ''} from {artist_name}"
        return await self.send_notification(title, NtfyService._format_release_message(releases))

    async def test_connection(self) -> bool:
        return await self.send_notification("Dropss", "Apprise notifications are configured correctly.")
