"""
ListenBrainz API integration service.
Fetches a user's top artists from their public statistics, so no token is needed.
"""
import logging
from typing import Dict, List, Literal
from urllib.parse import quote

import httpx

from ..config import APP_VERSION, get_settings
from .import_errors import ImportSourceError

logger = logging.getLogger(__name__)

# week, month, quarter, half_yearly and year are the last complete calendar period.
StatsRange = Literal["week", "month", "quarter", "half_yearly", "year", "all_time"]


class ListenBrainzService:
    """Service for interacting with the ListenBrainz API."""

    BASE_URL = "https://api.listenbrainz.org/1"
    # ListenBrainz asks for "name/version ( contact-url )" and may block clients without it.
    HEADERS = {"User-Agent": f"Dropss/{APP_VERSION} ( https://github.com/beeetfarmer/Dropss )"}
    TIMEOUT = 15.0

    def __init__(self):
        self.username = get_settings().listenbrainz_username

    @property
    def user_path(self) -> str:
        return quote(self.username, safe="")

    async def get_top_artists(self, period: StatsRange = "all_time", limit: int = 50) -> List[Dict]:
        if not self.username:
            raise ImportSourceError("Set your ListenBrainz username in Settings first.", 400)

        try:
            async with httpx.AsyncClient(timeout=self.TIMEOUT, headers=self.HEADERS) as client:
                response = await client.get(
                    f"{self.BASE_URL}/stats/user/{self.user_path}/artists",
                    params={"range": period, "count": limit},
                )
        except httpx.HTTPError as e:
            logger.warning("Could not reach ListenBrainz: %s", type(e).__name__)
            raise ImportSourceError("Could not reach ListenBrainz. Try again shortly.") from e

        if response.status_code == 204:
            raise ImportSourceError(
                "ListenBrainz has no statistics for that period yet. Try All time, or try again later.", 400
            )
        if response.status_code == 404:
            raise ImportSourceError("ListenBrainz user not found. Check the username in Settings.", 400)
        if response.status_code == 429:
            raise ImportSourceError("ListenBrainz rate limit reached. Try again shortly.", 503)
        if response.status_code != 200:
            logger.warning("ListenBrainz returned HTTP %s", response.status_code)
            raise ImportSourceError(f"ListenBrainz returned an error (HTTP {response.status_code}).")

        artists = response.json()["payload"]["artists"]
        return [{"name": a["artist_name"], "playcount": a["listen_count"]} for a in artists]
