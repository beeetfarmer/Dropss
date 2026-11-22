"""
Last.fm API integration service.
Fetches user's top artists for automatic following.
"""
import httpx
import logging
from typing import List, Dict
from ..config import get_settings
from .import_errors import ImportSourceError

logger = logging.getLogger(__name__)

PRO_REQUIRED = (
    "Last.fm refused your API key. From 1 December 2026 its API requires a Last.fm Pro subscription. "
    "If you already have Pro, check the key, or import from ListenBrainz instead."
)


class LastFmService:
    """Service for interacting with Last.fm API."""

    BASE_URL = "https://ws.audioscrobbler.com/2.0/"

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.lastfm_api_key
        self.username = settings.lastfm_username

    @staticmethod
    def read_body(response: httpx.Response) -> dict:
        try:
            body = response.json()
        except ValueError:
            return {}
        return body if isinstance(body, dict) else {}

    @staticmethod
    def key_refused(response: httpx.Response, body: dict) -> bool:
        # Last.fm hasn't said what a key without Pro gets back, so treat every "key refused" answer alike:
        # 4 authentication failed, 10 invalid key, 12 subscribers only, 26 key suspended, or a bare 401/402/403.
        # 17 is the exception: that user's listening history is private.
        code = body.get("error")
        return code in (4, 10, 12, 26) or (response.status_code in (401, 402, 403) and code != 17)

    async def get_top_artists(self, period: str = "overall", limit: int = 50) -> List[Dict]:
        """
        Fetch user's top artists from Last.fm.

        Args:
            period: Time period - "7day", "1month", "3month", "6month", "12month", or "overall"
            limit: Number of artists to return (max 1000)

        Returns:
            List of artist dictionaries with name and playcount
        """
        if not self.api_key or not self.username:
            logger.warning("Last.fm credentials missing")
            raise ImportSourceError("Last.fm API key and username must be configured.", 400)

        async with httpx.AsyncClient() as client:
            params = {
                "method": "user.gettopartists",
                "user": self.username,
                "api_key": self.api_key,
                "format": "json",
                "period": period,
                "limit": limit
            }

            try:
                response = await client.get(self.BASE_URL, params=params)
                data = self.read_body(response)
                if self.key_refused(response, data):
                    logger.warning("Last.fm refused access (HTTP %s)", response.status_code)
                    raise ImportSourceError(PRO_REQUIRED, 403)

                if "error" in data:
                    error_msg = data.get('message', 'Unknown error')
                    error_code = data.get('error', 'Unknown code')
                    logger.warning("Last.fm API returned error code %s", error_code)
                    raise ImportSourceError(f"Last.fm API error: {error_msg}")

                response.raise_for_status()
                artists_data = data.get("topartists", {}).get("artist", [])
                logger.info("Fetched %d artists from Last.fm", len(artists_data))

                artists = []
                for artist_data in artists_data:
                    artists.append({
                        "name": artist_data["name"],
                        "playcount": int(artist_data["playcount"]),
                        "mbid": artist_data.get("mbid", "")
                    })

                return artists

            except ImportSourceError:
                raise
            except httpx.HTTPStatusError as e:
                logger.warning("HTTP error from Last.fm: %s", e)
                raise
            except Exception as e:
                logger.warning("Unexpected Last.fm error: %s", e)
                raise
