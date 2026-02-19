import logging
import requests
from typing import Optional
from ..config import get_settings
from ..security import validate_outbound_url

logger = logging.getLogger(__name__)


class GotifyService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.gotify_url.rstrip('/')
        if self.base_url:
            validate_outbound_url(self.base_url, "gotify_url")
        self.app_token = settings.gotify_token

    async def send_notification(
        self,
        title: str,
        message: str,
        priority: int = 5,
        extras: Optional[dict] = None
    ) -> bool:
        try:
            url = f"{self.base_url}/message"
            data = {
                "title": title,
                "message": message,
                "priority": priority
            }

            if extras:
                data["extras"] = extras

            response = requests.post(
                url,
                headers={"X-Gotify-Key": self.app_token},
                json=data,
                timeout=10,
                allow_redirects=False,
            )
            response.raise_for_status()

            logger.info("Gotify notification sent")
            return True

        except requests.exceptions.RequestException as e:
            logger.warning("Error sending Gotify notification: %s", e)
            return False

    @staticmethod
    def _format_release_message(releases: list) -> str:
        lines = []
        for index, release in enumerate(releases, start=1):
            release_type = release.get('release_type', 'release').upper()
            release_name = release.get('name', 'Unknown')
            release_date = release.get('release_date', 'Unknown date')
            spotify_url = release.get('spotify_url', '')

            if spotify_url:
                lines.append(f"{index}. **[{release_type}] [{release_name}]({spotify_url})**")
            else:
                lines.append(f"{index}. **[{release_type}] {release_name}**")
            lines.append(f"Released: {release_date}")
            if index != len(releases):
                lines.append("")

        return "\n".join(lines)

    async def send_release_notification(
        self,
        artist_name: str,
        releases: list,
        priority: int = 7
    ) -> bool:
        if not releases:
            return False

        title = f"New Release{'s' if len(releases) > 1 else ''} from {artist_name}"

        message = self._format_release_message(releases)

        extras = {
            "client::display": {
                "contentType": "text/markdown"
            }
        }

        return await self.send_notification(title, message, priority, extras)

    async def test_connection(self) -> bool:
        return await self.send_notification(
            title="Dropss",
            message="Test connection successful.",
            priority=3
        )
