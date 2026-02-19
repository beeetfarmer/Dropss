import json
import logging
import requests
from typing import Optional
from ..config import get_settings
from ..security import validate_outbound_url

logger = logging.getLogger(__name__)


class NtfyService:
    def __init__(self):
        settings = get_settings()
        self.base_url = settings.ntfy_url.rstrip('/')
        if self.base_url:
            validate_outbound_url(self.base_url, "ntfy_url")
        self.topic = settings.ntfy_topic
        self.username = settings.ntfy_username if settings.ntfy_username else None
        self.password = settings.ntfy_password if settings.ntfy_password else None

    async def send_notification(
        self,
        title: str,
        message: str,
        priority: int = 3,
        tags: Optional[list] = None,
        click_url: Optional[str] = None
    ) -> bool:
        try:
            url = f"{self.base_url}"

            payload = {
                "topic": self.topic,
                "title": title,
                "message": message,
                "priority": priority,
                "markdown": True,
            }

            if tags:
                payload["tags"] = tags

            if click_url:
                payload["click"] = click_url

            auth = None
            if self.username and self.password:
                auth = (self.username, self.password)

            response = requests.post(
                url,
                data=json.dumps(payload),
                headers={"Content-Type": "application/json"},
                auth=auth,
                timeout=10,
                allow_redirects=False,
            )
            response.raise_for_status()

            logger.info("Ntfy notification sent")
            return True

        except requests.exceptions.RequestException as e:
            logger.warning("Error sending ntfy notification: %s", e)
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
        priority: int = 4
    ) -> bool:
        if not releases:
            return False

        title = f"New Release{'s' if len(releases) > 1 else ''} from {artist_name}"

        message = self._format_release_message(releases)

        click_url = releases[0].get('spotify_url') if releases else None

        return await self.send_notification(
            title,
            message,
            priority,
            tags=None,
            click_url=click_url,
        )

    async def test_connection(self) -> bool:
        return await self.send_notification(
            title="Dropss",
            message="Test connection successful.",
            priority=2,
            tags=None
        )
