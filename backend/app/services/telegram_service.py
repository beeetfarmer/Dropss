import html
import logging
import requests
from typing import Optional
from ..config import get_settings

logger = logging.getLogger(__name__)

API_BASE = "https://api.telegram.org"

# Telegram has no per-release-type icon, so give each one a glyph to make a
# multi-release message scannable at a glance.
TYPE_ICONS = {
    "album": "\U0001F4BF",
    "single": "\U0001F3B5",
    "ep": "\U0001F4C0",
    "compilation": "\U0001F4E6",
    "appears_on": "\U0001F91D",
}
DEFAULT_ICON = "\U0001F3B6"

# str.title() mangles the short forms ("ep" -> "Ep"), so spell them out.
TYPE_LABELS = {
    "ep": "EP",
    "appears_on": "Appears On",
}


class TelegramService:
    def __init__(self):
        settings = get_settings()
        self.bot_token = settings.telegram_bot_token
        self.chat_id = settings.telegram_chat_id

    async def send_notification(
        self,
        title: str,
        message: str,
        disable_notification: bool = False,
        preview_url: Optional[str] = None,
    ) -> bool:
        """Send an HTML-formatted message.

        HTML is used rather than MarkdownV2: release titles routinely contain
        brackets, parentheses, dots and dashes, all of which MarkdownV2 requires
        escaping and which silently break the message when missed. HTML only
        needs &, < and > escaped.
        """
        if not self.bot_token or not self.chat_id:
            logger.warning("Telegram is not configured")
            return False

        text = f"{title}\n\n{message}" if message else title

        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "parse_mode": "HTML",
            "disable_notification": disable_notification,
            # Show the album art card when there is a single obvious link,
            # otherwise suppress previews so a long list stays compact.
            "link_preview_options": (
                {"is_disabled": False, "url": preview_url, "prefer_large_media": True}
                if preview_url
                else {"is_disabled": True}
            ),
        }

        try:
            response = requests.post(
                f"{API_BASE}/bot{self.bot_token}/sendMessage",
                json=payload,
                timeout=10,
                allow_redirects=False,
            )
            response.raise_for_status()
            logger.info("Telegram notification sent")
            return True
        except requests.exceptions.RequestException as e:
            # Telegram returns the real reason in the body; surface it, since
            # "chat not found" and "unauthorized" are the usual setup mistakes.
            detail = ""
            if e.response is not None:
                detail = e.response.text[:200]
            logger.warning("Error sending Telegram notification: %s %s", e, detail)
            return False

    @staticmethod
    def _format_release_message(releases: list) -> str:
        lines = []
        for release in releases:
            release_type = str(release.get("release_type", "release")).lower()
            icon = TYPE_ICONS.get(release_type, DEFAULT_ICON)
            name = html.escape(str(release.get("name", "Unknown")))
            date = html.escape(str(release.get("release_date", "Unknown date")))
            label = html.escape(
                TYPE_LABELS.get(release_type, release_type.replace("_", " ").title())
            )
            url = release.get("spotify_url", "")
            tracks = release.get("total_tracks")

            inner = f'<a href="{html.escape(url, quote=True)}">{name}</a>' if url else name
            lines.append(f"{icon} <b>{inner}</b>")

            meta = [label, date]
            if tracks:
                meta.append(f"{tracks} track{'s' if tracks != 1 else ''}")
            lines.append(f"    <i>{' · '.join(meta)}</i>")
            lines.append("")

        return "\n".join(lines).rstrip()

    async def send_release_notification(
        self,
        artist_name: str,
        releases: list,
    ) -> bool:
        if not releases:
            return False

        count = len(releases)
        artist = html.escape(str(artist_name))
        heading = (
            f"\U0001F514 <b>New release from {artist}</b>"
            if count == 1
            else f"\U0001F514 <b>{count} new releases from {artist}</b>"
        )

        # Preview the cover art only when a single release makes it unambiguous.
        preview_url = releases[0].get("spotify_url") if count == 1 else None

        return await self.send_notification(
            heading,
            self._format_release_message(releases),
            preview_url=preview_url,
        )

    async def test_connection(self) -> bool:
        return await self.send_notification(
            "\U00002705 <b>Dropss</b>",
            "Telegram notifications are configured correctly.",
            disable_notification=True,
        )
